const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { logEvent } = require('../../core/eventLog');
const { logAudit } = require('../../core/auditLog');

const router = express.Router();

// Мастеру номер телефона клиента не показываем вообще (владелец: "мастер не
// должен видеть номер телефона") — скрываем на уровне сервера, а не
// полагаемся на фронтенд. Раньше показывались последние 4 цифры — решили
// убрать и это.
function sanitize(client, role) {
  if (role === 'master' && client.phone) {
    return { ...client, phone: null };
  }
  return client;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search } = req.query;
    const params = [req.tenant.companyId];
    let where = 'company_id = $1';
    if (search) {
      params.push(`${search}%`);
      let clause = `(last_name ILIKE $${params.length} OR first_name ILIKE $${params.length})`;
      // Поиск по телефону — сравниваем только цифры (телефон вводится
      // свободным текстом: "+7 900 123-45-67", "89001234567" и т.п.
      // считаем одним и тем же номером). Ищем ПОДстроку, не префикс —
      // удобно найти клиента по последним цифрам номера.
      const searchDigits = search.replace(/\D/g, '');
      if (searchDigits) {
        params.push(`%${searchDigits}%`);
        clause = `(${clause} OR regexp_replace(phone, '\\D', '', 'g') ILIKE $${params.length})`;
      }
      where += ` AND ${clause}`;
    }
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, phone, preferences, notes, allergies, created_at FROM clients
       WHERE ${where} ORDER BY last_name, first_name LIMIT 50`,
      params
    );
    res.json(rows.map((c) => sanitize(c, req.tenant.role)));
  })
);

// Лёгкий лист ожидания (владелец, 29.07.2026) — без расписания/слотов,
// которых в приложении нет: просто список "клиент хочет записаться",
// вручную отмечается "связался/записали", когда реально появится время.
// Роут-статик '/waitlist' должен идти РАНЬШЕ '/:id' ниже — иначе Express
// принял бы "waitlist" за :id и запрос упал бы с ошибкой типа в Postgres.
router.get(
  '/waitlist',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT w.id, w.client_id, w.service, w.comment, w.status, w.created_at, w.resolved_at,
              c.first_name AS client_first_name, c.last_name AS client_last_name,
              u.name AS created_by_name
       FROM client_waitlist w
       JOIN clients c ON c.id = w.client_id
       LEFT JOIN memberships m ON m.id = w.created_by_membership_id
       LEFT JOIN users u ON u.id = m.user_id
       WHERE w.company_id = $1
       ORDER BY (w.status = 'waiting') DESC, w.created_at DESC`,
      [req.tenant.companyId]
    );
    res.json(rows);
  })
);

router.post(
  '/:id/waitlist',
  asyncHandler(async (req, res) => {
    const { service, comment } = req.body;
    const client = await pool.query('SELECT 1 FROM clients WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
    if (client.rows.length === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    const { rows } = await pool.query(
      `INSERT INTO client_waitlist (company_id, client_id, service, comment, created_by_membership_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, client_id, service, comment, status, created_at, resolved_at`,
      [req.tenant.companyId, req.params.id, service || null, comment || null, req.tenant.membershipId || null]
    );
    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/waitlist/:entryId',
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!['waiting', 'done'].includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус' });
    }
    const { rows } = await pool.query(
      `UPDATE client_waitlist SET status = $1, resolved_at = CASE WHEN $1 = 'done' THEN now() ELSE NULL END
       WHERE id = $2 AND company_id = $3
       RETURNING id, client_id, service, comment, status, created_at, resolved_at`,
      [status, req.params.entryId, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }
    res.json(rows[0]);
  })
);

router.delete(
  '/waitlist/:entryId',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM client_waitlist WHERE id = $1 AND company_id = $2', [
      req.params.entryId,
      req.tenant.companyId,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }
    res.status(204).end();
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT id, first_name, last_name, phone, preferences, notes, allergies, created_at FROM clients WHERE id = $1 AND company_id = $2',
      [req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    res.json(sanitize(rows[0], req.tenant.role));
  })
);

// Раньше два клиента с одним и тем же телефоном спокойно создавались —
// ничего не сверялось. Сравниваем по цифрам номера (форматы вроде
// "+7 900..." и "8900..." — один и тот же номер), не по точному тексту.
// Возвращает существующего клиента с таким же номером или null.
async function findClientByPhone(companyId, phone, excludeId) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const params = [companyId, digits];
  let where = `company_id = $1 AND regexp_replace(phone, '\\D', '', 'g') = $2`;
  if (excludeId) {
    params.push(excludeId);
    where += ` AND id != $${params.length}`;
  }
  const { rows } = await pool.query(`SELECT id, first_name, last_name FROM clients WHERE ${where} LIMIT 1`, params);
  return rows[0] || null;
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { firstName, lastName, phone, preferences, notes, allergies, confirmDuplicate } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'Укажите имя и фамилию клиента' });
    }
    if (phone && !confirmDuplicate) {
      const existing = await findClientByPhone(req.tenant.companyId, phone);
      if (existing) {
        return res.status(409).json({
          error: 'duplicate_phone',
          existingClient: { id: existing.id, firstName: existing.first_name, lastName: existing.last_name },
        });
      }
    }
    const { rows } = await pool.query(
      `INSERT INTO clients (company_id, first_name, last_name, phone, preferences, notes, allergies, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, first_name, last_name, phone, preferences, notes, allergies, created_at`,
      [req.tenant.companyId, firstName, lastName, phone || null, preferences || null, notes || null, allergies || null, req.user.id]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'clients',
      userId: req.user.id,
      entityType: 'client',
      entityId: rows[0].id,
      action: 'client.created',
    });

    res.status(201).json(sanitize(rows[0], req.tenant.role));
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { firstName, lastName, phone, preferences, notes, allergies, confirmDuplicate } = req.body;
    if (phone && !confirmDuplicate) {
      const existing = await findClientByPhone(req.tenant.companyId, phone, req.params.id);
      if (existing) {
        return res.status(409).json({
          error: 'duplicate_phone',
          existingClient: { id: existing.id, firstName: existing.first_name, lastName: existing.last_name },
        });
      }
    }
    const { rows } = await pool.query(
      `UPDATE clients SET
         first_name = COALESCE($1, first_name),
         last_name = COALESCE($2, last_name),
         phone = COALESCE($3, phone),
         preferences = COALESCE($4, preferences),
         notes = COALESCE($5, notes),
         allergies = COALESCE($6, allergies)
       WHERE id = $7 AND company_id = $8
       RETURNING id, first_name, last_name, phone, preferences, notes, allergies, created_at`,
      [firstName || null, lastName || null, phone || null, preferences || null, notes || null, allergies || null, req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'clients',
      userId: req.user.id,
      entityType: 'client',
      entityId: rows[0].id,
      action: 'client.updated',
    });

    res.json(sanitize(rows[0], req.tenant.role));
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    let rowCount;
    try {
      ({ rowCount } = await pool.query('DELETE FROM clients WHERE id = $1 AND company_id = $2', [
        req.params.id,
        req.tenant.companyId,
      ]));
    } catch (err) {
      // visits.client_id -> clients(id) ON DELETE RESTRICT: у клиента уже есть
      // визиты, нельзя стереть без потери финансовой истории. Тот же паттерн,
      // что и для расходников (supplies.routes.js).
      if (err.code === '23503') {
        return res.status(400).json({ error: 'Нельзя удалить: у клиента уже есть визиты' });
      }
      throw err;
    }
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'clients',
      userId: req.user.id,
      entityType: 'client',
      entityId: Number(req.params.id),
      action: 'client.deleted',
    });
    await logAudit({
      companyId: req.tenant.companyId,
      userId: req.user.id,
      action: 'client.deleted',
      entityType: 'client',
      entityId: Number(req.params.id),
    });

    res.status(204).end();
  })
);

module.exports = router;
