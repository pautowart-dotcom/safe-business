const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { logEvent } = require('../../core/eventLog');
const { logAudit } = require('../../core/auditLog');

const router = express.Router();

// Мастеру показываем только последние 4 цифры телефона клиента (Этап 5) —
// маскируем на уровне сервера, а не полагаемся на фронтенд.
function maskPhone(phone) {
  if (!phone) return phone;
  const last4 = phone.replace(/\D/g, '').slice(-4);
  return last4 ? `•••• ${last4}` : phone;
}

function sanitize(client, role) {
  if (role === 'master' && client.phone) {
    return { ...client, phone: maskPhone(client.phone) };
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
      where += ` AND (last_name ILIKE $${params.length} OR first_name ILIKE $${params.length})`;
    }
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, phone, preferences, notes, allergies, created_at FROM clients
       WHERE ${where} ORDER BY last_name, first_name LIMIT 50`,
      params
    );
    res.json(rows.map((c) => sanitize(c, req.tenant.role)));
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

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { firstName, lastName, phone, preferences, notes, allergies } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'Укажите имя и фамилию клиента' });
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
    const { firstName, lastName, phone, preferences, notes, allergies } = req.body;
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
    const { rowCount } = await pool.query('DELETE FROM clients WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
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
