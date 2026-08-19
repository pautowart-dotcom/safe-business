const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const emptyToNull = require('../../utils/emptyToNull');
const { logEvent } = require('../../core/eventLog');
const { createExpenseEntry } = require('./expense-entries.service');

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
      `SELECT id, name, amount, category, channel, occurred_at, created_at FROM expense_entries
       WHERE ${where} ORDER BY occurred_at DESC LIMIT 200`,
      params
    );
    res.json(rows);
  })
);

// category — один из EXPENSE_CATEGORIES (см. миграцию 0080), не обязателен —
// у старых записей его нет, гадать задним числом не пытаемся. channel имеет
// смысл только при category='advertising' (какая именно реклама), но это не
// проверяется на бэкенде — фронт просто не показывает поле для других
// категорий, здесь достаточно принять то, что пришло.
// Логика создания вынесена в expense-entries.service.js (createExpenseEntry)
// — 19.08.2026, чтобы её же переиспользовал инструмент create_expense
// ИИ-ассистента (modules/ai-assistant/tools/registry.js) без дублирования
// SQL. Сам роут не изменился по поведению — тот же 400 при отсутствии
// name/amount (теперь бросается сервисом, ловится общим error-handler'ом в
// app.js по err.status).
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, amount, occurredAt, category, channel } = req.body;
    const row = await createExpenseEntry({
      companyId: req.tenant.companyId,
      userId: req.user.id,
      name,
      amount,
      occurredAt,
      category,
      channel,
    });
    res.status(201).json(row);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, amount, occurredAt, category, channel } = req.body;
    const { rows } = await pool.query(
      `UPDATE expense_entries SET
         name = COALESCE($1, name),
         amount = COALESCE($2, amount),
         occurred_at = COALESCE($3, occurred_at),
         category = COALESCE($4, category),
         channel = COALESCE($5, channel)
       WHERE id = $6 AND company_id = $7
       RETURNING id, name, amount, category, channel, occurred_at, created_at`,
      [name || null, emptyToNull(amount), occurredAt || null, category || null, channel || null, req.params.id, req.tenant.companyId]
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
