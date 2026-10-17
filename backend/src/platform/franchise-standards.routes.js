// Стандарты сети и проверки точек (17.10.2026, миграция 0138,
// docs/franchisor-compliance.md §2). /network/* — сторона франчайзера:
// список стандартов (правит только владелец сети), проверки от сети —
// владелец и сотрудники сети с доступом к пульту (это и есть проверяющие).
// /mine/* — сторона точки: самопроверка и результаты проверок от сети.
const crypto = require('crypto');
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { networkAccess } = require('../core/franchiseAccess');
const { notifyCompany } = require('../core/notifications');
const { logEvent } = require('../core/eventLog');
const { TEMPLATES, listStandards, latestChecksByPoint, checkDetail, saveCheck } = require('../modules/franchise/standards');

const router = express.Router();
router.use(requireAuth, requireTenant, requireRole('owner', 'admin'));

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

async function runSave(res, params) {
  try {
    return await saveCheck(params);
  } catch (err) {
    if (err.status === 400) {
      res.status(400).json({ error: err.message });
      return null;
    }
    throw err;
  }
}

// ---------- Сторона сети ----------

router.get(
  '/network',
  asyncHandler(async (req, res) => {
    const access = await networkAccess(req);
    if (!access) return res.status(404).json({ error: 'Нет доступа к пульту сети' });
    const [standards, latest, points] = await Promise.all([
      listStandards(access.group.id),
      latestChecksByPoint(access.group.id),
      pool.query('SELECT id, name FROM companies WHERE franchise_group_id = $1 ORDER BY name', [access.group.id]),
    ]);
    res.json({
      canManage: access.canManage,
      networkName: access.group.name,
      standards,
      points: points.rows.map((p) => ({ companyId: p.id, companyName: p.name, ...(latest.get(p.id) || {}) })),
    });
  })
);

router.post(
  '/network',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const access = await networkAccess(req);
    if (!access?.canManage) return res.status(404).json({ error: 'Вы не владеете сетью' });
    const { title, hint } = req.body || {};
    if (!title || typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Напишите, что проверяем' });
    const { rows } = await pool.query(
      `INSERT INTO franchise_standards (franchise_group_id, title, hint, position)
       VALUES ($1, $2, $3, COALESCE((SELECT max(position) + 1 FROM franchise_standards WHERE franchise_group_id = $1), 0))
       RETURNING id, title, hint`,
      [access.group.id, title.trim().slice(0, 200), typeof hint === 'string' ? hint.trim() || null : null]
    );
    res.status(201).json(rows[0]);
  })
);

// Добавить стартовый набор под нишу сети (детские клубы или общий).
router.post(
  '/network/template',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const access = await networkAccess(req);
    if (!access?.canManage) return res.status(404).json({ error: 'Вы не владеете сетью' });
    const template = TEMPLATES[req.body?.template] || TEMPLATES.default;
    const { rows } = await pool.query('SELECT COALESCE(max(position) + 1, 0) AS start FROM franchise_standards WHERE franchise_group_id = $1', [access.group.id]);
    let position = rows[0].start;
    for (const t of template) {
      await pool.query(
        'INSERT INTO franchise_standards (franchise_group_id, title, hint, position) VALUES ($1, $2, $3, $4)',
        [access.group.id, t.title, t.hint || null, position++]
      );
    }
    res.status(201).json(await listStandards(access.group.id));
  })
);

router.patch(
  '/network/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const access = await networkAccess(req);
    if (!access?.canManage) return res.status(404).json({ error: 'Вы не владеете сетью' });
    const { title, hint } = req.body || {};
    if (title !== undefined && (typeof title !== 'string' || !title.trim())) return res.status(400).json({ error: 'Название не может быть пустым' });
    const { rows } = await pool.query(
      `UPDATE franchise_standards SET title = COALESCE($1, title), hint = CASE WHEN $2 THEN $3 ELSE hint END
       WHERE id = $4 AND franchise_group_id = $5 AND archived_at IS NULL RETURNING id, title, hint`,
      [title?.trim().slice(0, 200) || null, hint !== undefined, typeof hint === 'string' ? hint.trim() || null : null, req.params.id, access.group.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Пункт не найден' });
    res.json(rows[0]);
  })
);

// Убрать пункт: прошлые ответы по нему остаются в истории, в процент не идут.
router.delete(
  '/network/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const access = await networkAccess(req);
    if (!access?.canManage) return res.status(404).json({ error: 'Вы не владеете сетью' });
    const { rowCount } = await pool.query(
      'UPDATE franchise_standards SET archived_at = now() WHERE id = $1 AND franchise_group_id = $2 AND archived_at IS NULL',
      [req.params.id, access.group.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Пункт не найден' });
    res.status(204).end();
  })
);

// Проверка от сети (визит проверяющего или тайного покупателя).
router.post(
  '/network/audits',
  asyncHandler(async (req, res) => {
    const access = await networkAccess(req);
    if (!access) return res.status(404).json({ error: 'Нет доступа к пульту сети' });
    const { companyId, auditorLabel, visitedOn, comment, answers } = req.body || {};
    const { rows: point } = await pool.query('SELECT id FROM companies WHERE id = $1 AND franchise_group_id = $2', [companyId, access.group.id]);
    if (point.length === 0) return res.status(400).json({ error: 'Выберите точку своей сети' });
    if (visitedOn && !isDate(visitedOn)) return res.status(400).json({ error: 'Некорректная дата визита' });

    const saved = await runSave(res, {
      groupId: access.group.id,
      companyId: point[0].id,
      kind: 'audit',
      auditorLabel: typeof auditorLabel === 'string' ? auditorLabel.trim().slice(0, 120) : null,
      visitedOn,
      comment: typeof comment === 'string' ? comment.trim().slice(0, 2000) : null,
      answers,
      userId: req.user.id,
    });
    if (!saved) return;

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'franchise_standard_check',
      entityId: saved.checkId,
      action: 'franchise_standard.audit_created',
    });
    // Точка видит результат проверки — честно, без «тайных» оценок за спиной.
    notifyCompany({
      companyId: point[0].id,
      kind: 'network',
      title: `Проверка от сети: ${saved.percent ?? '—'}% по стандартам`,
      body: 'Что отмечено и что поправить — в разделе «Стандарты сети».',
      url: '/network-standards',
      dedupeKey: `franchise_audit:${saved.checkId}`,
    }).catch((err) => console.error('franchise audit notify failed', saved.checkId, err));

    res.status(201).json(saved);
  })
);

// Ссылка для проверяющего без аккаунта (миграция 0139): одна точка, один
// раз, 14 дней. Публичная форма — franchise-audit-public.routes.js.
const AUDIT_LINK_DAYS = 14;

function publicBaseUrl(req) {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
  const proto = req.get('x-forwarded-proto') || req.protocol;
  return `${proto}://${req.get('host')}/lk`;
}

router.post(
  '/network/audit-links',
  asyncHandler(async (req, res) => {
    const access = await networkAccess(req);
    if (!access) return res.status(404).json({ error: 'Нет доступа к пульту сети' });
    const { companyId, auditorLabel } = req.body || {};
    const { rows: point } = await pool.query('SELECT id FROM companies WHERE id = $1 AND franchise_group_id = $2', [companyId, access.group.id]);
    if (point.length === 0) return res.status(400).json({ error: 'Выберите точку своей сети' });
    if ((await listStandards(access.group.id)).length === 0) return res.status(400).json({ error: 'Сначала добавьте стандарты сети' });

    const token = crypto.randomBytes(24).toString('hex');
    const { rows } = await pool.query(
      `INSERT INTO franchise_audit_links (token, franchise_group_id, company_id, auditor_label, created_by_user_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' days')::interval) RETURNING expires_at`,
      [token, access.group.id, point[0].id, typeof auditorLabel === 'string' ? auditorLabel.trim().slice(0, 120) || null : null, req.user.id, String(AUDIT_LINK_DAYS)]
    );
    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'franchise_audit_link',
      entityId: point[0].id,
      action: 'franchise_standard.audit_link_created',
    });
    res.status(201).json({ url: `${publicBaseUrl(req)}/a/${token}`, expiresAt: rows[0].expires_at });
  })
);

router.get(
  '/network/checks/:checkId',
  asyncHandler(async (req, res) => {
    const access = await networkAccess(req);
    if (!access) return res.status(404).json({ error: 'Нет доступа к пульту сети' });
    const { rows } = await pool.query(
      `SELECT ch.id, ch.kind, ch.auditor_label AS "auditorLabel", to_char(ch.visited_on, 'YYYY-MM-DD') AS "visitedOn", ch.comment, ch.created_at AS "createdAt", c.name AS "companyName"
       FROM franchise_standard_checks ch JOIN companies c ON c.id = ch.company_id AND c.franchise_group_id = ch.franchise_group_id
       WHERE ch.id = $1 AND ch.franchise_group_id = $2`,
      [req.params.checkId, access.group.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Проверка не найдена' });
    res.json({ ...rows[0], answers: await checkDetail(rows[0].id) });
  })
);

// ---------- Сторона точки ----------

async function myGroup(companyId) {
  const { rows } = await pool.query(
    'SELECT fg.id, fg.name FROM companies c JOIN franchise_groups fg ON fg.id = c.franchise_group_id WHERE c.id = $1',
    [companyId]
  );
  return rows[0] || null;
}

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const group = await myGroup(req.tenant.companyId);
    if (!group) return res.json({ networkName: null, standards: [] });
    const [standards, latest] = await Promise.all([listStandards(group.id), latestChecksByPoint(group.id)]);
    const mine = latest.get(req.tenant.companyId) || {};
    const [selfAnswers, auditAnswers, auditMeta] = await Promise.all([
      mine.self ? checkDetail(mine.self.checkId) : [],
      mine.audit ? checkDetail(mine.audit.checkId) : [],
      mine.audit ? pool.query('SELECT comment FROM franchise_standard_checks WHERE id = $1', [mine.audit.checkId]) : { rows: [] },
    ]);
    res.json({
      networkName: group.name,
      standards,
      self: mine.self ? { ...mine.self, answers: selfAnswers } : null,
      audit: mine.audit ? { ...mine.audit, comment: auditMeta.rows[0]?.comment || null, answers: auditAnswers } : null,
    });
  })
);

router.post(
  '/mine/self',
  asyncHandler(async (req, res) => {
    const group = await myGroup(req.tenant.companyId);
    if (!group) return res.status(404).json({ error: 'Вы не состоите в сети' });
    const saved = await runSave(res, {
      groupId: group.id,
      companyId: req.tenant.companyId,
      kind: 'self',
      answers: req.body?.answers,
      userId: req.user.id,
    });
    if (!saved) return;
    res.status(201).json(saved);
  })
);

module.exports = router;
