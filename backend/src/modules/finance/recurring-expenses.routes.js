const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const emptyToNull = require('../../utils/emptyToNull');
const { logEvent } = require('../../core/eventLog');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT id, name, kind, amount, category, channel, active, created_at FROM recurring_expenses WHERE company_id = $1 ORDER BY kind, name',
      [req.tenant.companyId]
    );
    res.json(rows);
  })
);

// category/channel — та же пара полей, что у expense_entries (миграция
// 0080). Постоянный рекламный бюджет чаще всего сидит именно здесь
// (fixed-статья "Реклама, N ₽/мес"), не как разовая запись.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, kind, amount, category, channel } = req.body;
    if (!name || !['fixed', 'percent'].includes(kind) || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'Укажите название, тип (fixed или percent) и сумму' });
    }
    const { rows } = await pool.query(
      `INSERT INTO recurring_expenses (company_id, name, kind, amount, category, channel)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, kind, amount, category, channel, active, created_at`,
      [req.tenant.companyId, name, kind, amount, category || null, channel || null]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'finance',
      userId: req.user.id,
      entityType: 'recurring_expense',
      entityId: rows[0].id,
      action: 'recurring_expense.created',
    });

    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, amount, active, category, channel } = req.body;
    const { rows } = await pool.query(
      `UPDATE recurring_expenses SET
         name = COALESCE($1, name),
         amount = COALESCE($2, amount),
         active = COALESCE($3, active),
         category = COALESCE($4, category),
         channel = COALESCE($5, channel)
       WHERE id = $6 AND company_id = $7
       RETURNING id, name, kind, amount, category, channel, active, created_at`,
      [name || null, emptyToNull(amount), emptyToNull(active), category || null, channel || null, req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Статья расходов не найдена' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'finance',
      userId: req.user.id,
      entityType: 'recurring_expense',
      entityId: rows[0].id,
      action: 'recurring_expense.updated',
    });

    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      'DELETE FROM recurring_expenses WHERE id = $1 AND company_id = $2',
      [req.params.id, req.tenant.companyId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Статья расходов не найдена' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'finance',
      userId: req.user.id,
      entityType: 'recurring_expense',
      entityId: Number(req.params.id),
      action: 'recurring_expense.deleted',
    });

    res.status(204).end();
  })
);

module.exports = router;
