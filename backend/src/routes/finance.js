const express = require('express');
const pool = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();
router.use(requireAuth);
// Финансовый раздел — только для владельца
router.use(requireRole('owner'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { from, to, type, category } = req.query;
    const conditions = [];
    const params = [];
    let i = 1;
    if (from) { conditions.push(`occurred_at >= $${i++}`); params.push(from); }
    if (to) { conditions.push(`occurred_at <= $${i++}`); params.push(to); }
    if (type) { conditions.push(`type = $${i++}`); params.push(type); }
    if (category) { conditions.push(`category = $${i++}`); params.push(category); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM finance_transactions ${where} ORDER BY occurred_at DESC`,
      params
    );
    res.json(result.rows);
  })
);

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const conditions = [];
    const params = [];
    let i = 1;
    if (from) { conditions.push(`occurred_at >= $${i++}`); params.push(from); }
    if (to) { conditions.push(`occurred_at <= $${i++}`); params.push(to); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT type, SUM(amount)::float AS total FROM finance_transactions ${where} GROUP BY type`,
      params
    );
    const summary = { income: 0, expense: 0 };
    result.rows.forEach((row) => { summary[row.type] = row.total; });
    summary.profit = summary.income - summary.expense;

    const byCategory = await pool.query(
      `SELECT category, type, SUM(amount)::float AS total FROM finance_transactions ${where}
       GROUP BY category, type ORDER BY total DESC`,
      params
    );
    res.json({ ...summary, byCategory: byCategory.rows });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { type, amount, category, description, occurred_at } = req.body;
    if (!type || !amount || !category) {
      return res.status(400).json({ error: 'Укажите тип, сумму и категорию' });
    }
    const result = await pool.query(
      `INSERT INTO finance_transactions (type, amount, category, description, occurred_at, created_by)
       VALUES ($1, $2, $3, $4, COALESCE($5, now()), $6) RETURNING *`,
      [type, amount, category, description || null, occurred_at || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { type, amount, category, description, occurred_at } = req.body;
    const result = await pool.query(
      `UPDATE finance_transactions SET
        type = COALESCE($1, type),
        amount = COALESCE($2, amount),
        category = COALESCE($3, category),
        description = $4,
        occurred_at = COALESCE($5, occurred_at)
       WHERE id = $6 RETURNING *`,
      [type, amount, category, description, occurred_at, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Операция не найдена' });
    }
    res.json(result.rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM finance_transactions WHERE id = $1', [req.params.id]);
    res.status(204).end();
  })
);

module.exports = router;
