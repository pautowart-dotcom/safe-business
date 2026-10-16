// Задачи от сети (16.10.2026, docs/franchise-funkcional.md §11, этап 3:
// Ф30/Ф31). /network/* — сторона франчайзера (пульт), /mine/* — сторона
// точки. Точка видит задачи только той сети, в которой состоит сейчас.
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { networkAccess } = require('../core/franchiseAccess');
const { notifyCompany } = require('../core/notifications');
const { logEvent } = require('../core/eventLog');

const router = express.Router();
router.use(requireAuth, requireTenant, requireRole('owner', 'admin'));

const KINDS = { order: 'Распоряжение сети', check: 'Проверьте у себя' };

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

// ---------- Сторона сети ----------

router.get(
  '/network',
  asyncHandler(async (req, res) => {
    const access = await networkAccess(req);
    if (!access) return res.status(404).json({ error: 'Нет доступа к пульту сети' });
    // Считаем только точки, которые сейчас в сети.
    const { rows } = await pool.query(
      `SELECT t.id, t.kind, t.title, t.body, to_char(t.due_date, 'YYYY-MM-DD') AS "dueDate", t.created_at AS "createdAt",
              count(c.id)::int AS total, count(c.id) FILTER (WHERE tp.done_at IS NOT NULL)::int AS done
       FROM franchise_tasks t
       LEFT JOIN franchise_task_points tp ON tp.task_id = t.id
       LEFT JOIN companies c ON c.id = tp.company_id AND c.franchise_group_id = t.franchise_group_id
       WHERE t.franchise_group_id = $1 AND t.archived_at IS NULL
       GROUP BY t.id ORDER BY t.created_at DESC`,
      [access.group.id]
    );
    res.json({ tasks: rows, canManage: access.canManage });
  })
);

router.post(
  '/network',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const access = await networkAccess(req);
    if (!access?.canManage) return res.status(404).json({ error: 'Вы не владеете сетью' });

    const { kind, title, body, dueDate, companyIds } = req.body || {};
    if (!KINDS[kind]) return res.status(400).json({ error: 'Выберите тип задачи' });
    if (!title || typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Напишите, что нужно сделать' });
    if (dueDate && !isDate(dueDate)) return res.status(400).json({ error: 'Некорректная дата' });
    if (body != null && typeof body !== 'string') return res.status(400).json({ error: 'Некорректный текст' });

    const { rows: members } = await pool.query('SELECT id FROM companies WHERE franchise_group_id = $1', [access.group.id]);
    let targets = members.map((m) => m.id);
    // Можно отправить не всем, а выбранным точкам — только из своей сети.
    if (Array.isArray(companyIds) && companyIds.length > 0) {
      const wanted = new Set(companyIds.map(Number));
      targets = targets.filter((id) => wanted.has(id));
    }
    if (targets.length === 0) return res.status(400).json({ error: 'В сети нет точек, которым можно отправить задачу' });

    const client = await pool.connect();
    let task;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO franchise_tasks (franchise_group_id, kind, title, body, due_date, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, kind, title, body, to_char(due_date, 'YYYY-MM-DD') AS "dueDate", created_at AS "createdAt"`,
        [access.group.id, kind, title.trim().slice(0, 200), body?.trim() || null, dueDate || null, req.user.id]
      );
      task = rows[0];
      await client.query(
        `INSERT INTO franchise_task_points (task_id, company_id) SELECT $1, unnest($2::int[])`,
        [task.id, targets]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'franchise_task',
      entityId: task.id,
      action: 'franchise_task.created',
      payload: { points: targets.length },
    });

    // Уведомления точкам — не держим ответ франчайзеру, пока уходят push.
    const notifyTitle = `${KINDS[kind]}: ${task.title}`;
    const notifyBody = [task.body, task.dueDate ? `Срок: ${new Date(`${task.dueDate}T00:00:00`).toLocaleDateString('ru-RU')}` : null].filter(Boolean).join('\n') || null;
    Promise.all(
      targets.map((companyId) =>
        notifyCompany({ companyId, kind: 'network', title: notifyTitle, body: notifyBody, url: '/network-tasks', dedupeKey: `franchise_task:${task.id}` })
      )
    ).catch((err) => console.error('franchise task notify failed', task.id, err));

    res.status(201).json({ ...task, total: targets.length, done: 0 });
  })
);

router.get(
  '/network/:id',
  asyncHandler(async (req, res) => {
    const access = await networkAccess(req);
    if (!access) return res.status(404).json({ error: 'Нет доступа к пульту сети' });
    const { rows: taskRows } = await pool.query(
      `SELECT id, kind, title, body, to_char(due_date, 'YYYY-MM-DD') AS "dueDate", created_at AS "createdAt"
       FROM franchise_tasks WHERE id = $1 AND franchise_group_id = $2 AND archived_at IS NULL`,
      [req.params.id, access.group.id]
    );
    if (taskRows.length === 0) return res.status(404).json({ error: 'Задача не найдена' });
    const { rows: points } = await pool.query(
      `SELECT c.id AS "companyId", c.name AS "companyName", tp.done_at AS "doneAt", tp.comment
       FROM franchise_task_points tp JOIN companies c ON c.id = tp.company_id
       WHERE tp.task_id = $1 AND c.franchise_group_id = $2
       ORDER BY tp.done_at IS NOT NULL, c.name`,
      [req.params.id, access.group.id]
    );
    res.json({ ...taskRows[0], points });
  })
);

// Убрать задачу из пульта и у точек (история остаётся в БД).
router.delete(
  '/network/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const access = await networkAccess(req);
    if (!access?.canManage) return res.status(404).json({ error: 'Вы не владеете сетью' });
    const { rowCount } = await pool.query(
      `UPDATE franchise_tasks SET archived_at = now() WHERE id = $1 AND franchise_group_id = $2 AND archived_at IS NULL`,
      [req.params.id, access.group.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Задача не найдена' });
    res.status(204).end();
  })
);

// ---------- Сторона точки ----------

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT t.id, t.kind, t.title, t.body, to_char(t.due_date, 'YYYY-MM-DD') AS "dueDate", t.created_at AS "createdAt",
              tp.done_at AS "doneAt", tp.comment, fg.name AS "networkName"
       FROM franchise_task_points tp
       JOIN franchise_tasks t ON t.id = tp.task_id
       JOIN companies c ON c.id = tp.company_id
       JOIN franchise_groups fg ON fg.id = t.franchise_group_id
       WHERE tp.company_id = $1 AND c.franchise_group_id = t.franchise_group_id AND t.archived_at IS NULL
       ORDER BY tp.done_at IS NOT NULL, t.due_date NULLS LAST, t.created_at DESC`,
      [req.tenant.companyId]
    );
    res.json({ tasks: rows, openCount: rows.filter((t) => !t.doneAt).length });
  })
);

router.put(
  '/mine/:taskId',
  asyncHandler(async (req, res) => {
    const { done, comment } = req.body || {};
    if (typeof done !== 'boolean') return res.status(400).json({ error: 'done должен быть true или false' });
    if (comment != null && typeof comment !== 'string') return res.status(400).json({ error: 'Некорректный комментарий' });

    const { rowCount } = await pool.query(
      `UPDATE franchise_task_points tp SET
         done_at = CASE WHEN $3 THEN COALESCE(tp.done_at, now()) ELSE NULL END,
         done_by_user_id = CASE WHEN $3 THEN $4::int ELSE NULL END,
         comment = $5
       FROM franchise_tasks t, companies c
       WHERE tp.task_id = $1 AND tp.company_id = $2 AND t.id = tp.task_id AND c.id = tp.company_id
         AND c.franchise_group_id = t.franchise_group_id AND t.archived_at IS NULL`,
      [req.params.taskId, req.tenant.companyId, done, req.user.id, comment?.trim().slice(0, 500) || null]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Задача не найдена' });
    res.json({ ok: true });
  })
);

module.exports = router;
