const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { logEvent } = require('../../core/eventLog');

const router = express.Router();

const CLIENT_TYPES = ['individual', 'legal_entity'];
const STATUSES = ['new', 'contacted', 'ordered', 'paid'];

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Активные заявки сверху (в порядке воронки), оплаченные — внизу, как
    // "обработано" в листе ожидания (clients.routes.js) — тот же принцип:
    // не нужно листать закрытые заявки, чтобы найти новую.
    const { rows } = await pool.query(
      `SELECT id, name, phone, client_type, comment, status, created_at, updated_at
       FROM leads WHERE company_id = $1
       ORDER BY (status = 'paid') ASC, array_position(ARRAY['new','contacted','ordered','paid'], status), created_at DESC`,
      [req.tenant.companyId]
    );
    res.json(rows);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, phone, clientType, comment } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Укажите имя или название клиента' });
    }
    if (clientType && !CLIENT_TYPES.includes(clientType)) {
      return res.status(400).json({ error: 'Некорректный тип клиента' });
    }
    const { rows } = await pool.query(
      `INSERT INTO leads (company_id, name, phone, client_type, comment, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, phone, client_type, comment, status, created_at, updated_at`,
      [req.tenant.companyId, name.trim(), phone || null, clientType || 'individual', comment || null, req.user.id]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'leads',
      userId: req.user.id,
      entityType: 'lead',
      entityId: rows[0].id,
      action: 'lead.created',
    });

    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, phone, clientType, comment, status } = req.body;
    if (clientType && !CLIENT_TYPES.includes(clientType)) {
      return res.status(400).json({ error: 'Некорректный тип клиента' });
    }
    if (status && !STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус' });
    }
    const { rows } = await pool.query(
      `UPDATE leads SET
         name = COALESCE($1, name),
         phone = COALESCE($2, phone),
         client_type = COALESCE($3, client_type),
         comment = COALESCE($4, comment),
         status = COALESCE($5, status),
         updated_at = now()
       WHERE id = $6 AND company_id = $7
       RETURNING id, name, phone, client_type, comment, status, created_at, updated_at`,
      [name?.trim() || null, phone || null, clientType || null, comment || null, status || null, req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'leads',
      userId: req.user.id,
      entityType: 'lead',
      entityId: rows[0].id,
      action: 'lead.updated',
    });

    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM leads WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }
    res.status(204).end();
  })
);

module.exports = router;
