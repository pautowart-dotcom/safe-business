const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { logEvent } = require('../../core/eventLog');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const params = [req.tenant.companyId];
    let where = 'company_id = $1';
    if (req.query.dateFrom) {
      params.push(req.query.dateFrom);
      where += ` AND occurred_at >= $${params.length}`;
    }
    if (req.query.dateTo) {
      params.push(req.query.dateTo);
      where += ` AND occurred_at <= $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT id, name, amount, occurred_at, created_at FROM expense_entries
       WHERE ${where} ORDER BY occurred_at DESC LIMIT 200`,
      params
    );
    res.json(rows);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, amount, occurredAt } = req.body;
    if (!name || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'Укажите название и сумму расхода' });
    }
    const { rows } = await pool.query(
      `INSERT INTO expense_entries (company_id, name, amount, occurred_at, created_by_user_id)
       VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5)
       RETURNING id, name, amount, occurred_at, created_at`,
      [req.tenant.companyId, name, amount, occurredAt || null, req.user.id]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'finance',
      userId: req.user.id,
      entityType: 'expense_entry',
      entityId: rows[0].id,
      action: 'expense_entry.created',
    });

    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, amount, occurredAt } = req.body;
    const { rows } = await pool.query(
      `UPDATE expense_entries SET
         name = COALESCE($1, name),
         amount = COALESCE($2, amount),
         occurred_at = COALESCE($3, occurred_at)
       WHERE id = $4 AND company_id = $5
       RETURNING id, name, amount, occurred_at, created_at`,
      [name || null, amount ?? null, occurredAt || null, req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Расход не найден' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'finance',
      userId: req.user.id,
      entityType: 'expense_entry',
      entityId: rows[0].id,
      action: 'expense_entry.updated',
    });

    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM expense_entries WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Расход не найден' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'finance',
      userId: req.user.id,
      entityType: 'expense_entry',
      entityId: Number(req.params.id),
      action: 'expense_entry.deleted',
    });

    res.status(204).end();
  })
);

module.exports = router;
