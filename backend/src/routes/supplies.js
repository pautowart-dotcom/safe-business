const express = require('express');
const pool = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await pool.query('SELECT * FROM supplies ORDER BY name');
    res.json(result.rows);
  })
);

router.get(
  '/low-stock',
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      'SELECT * FROM supplies WHERE quantity <= min_threshold ORDER BY name'
    );
    res.json(result.rows);
  })
);

router.get(
  '/:id/transactions',
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT st.*, u.name AS created_by_name FROM supply_transactions st
       LEFT JOIN users u ON u.id = st.created_by
       WHERE st.supply_id = $1 ORDER BY st.created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  })
);

// Создавать/редактировать позиции склада и приход товара может только владелец
router.post(
  '/',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { name, category, unit, quantity, min_threshold, price_per_unit } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Укажите название расходника' });
    }
    const result = await pool.query(
      `INSERT INTO supplies (name, category, unit, quantity, min_threshold, price_per_unit)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, category || null, unit || 'шт', quantity || 0, min_threshold || 0, price_per_unit || 0]
    );
    res.status(201).json(result.rows[0]);
  })
);

router.put(
  '/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { name, category, unit, min_threshold, price_per_unit } = req.body;
    const result = await pool.query(
      `UPDATE supplies SET
        name = COALESCE($1, name), category = $2, unit = COALESCE($3, unit),
        min_threshold = COALESCE($4, min_threshold), price_per_unit = COALESCE($5, price_per_unit),
        updated_at = now()
       WHERE id = $6 RETURNING *`,
      [name, category || null, unit, min_threshold, price_per_unit, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Расходник не найден' });
    }
    res.json(result.rows[0]);
  })
);

router.delete(
  '/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM supplies WHERE id = $1', [req.params.id]);
    res.status(204).end();
  })
);

// Движение склада: мастер может списывать расходники (out), владелец - и приход, и списание
router.post(
  '/:id/transactions',
  asyncHandler(async (req, res) => {
    const { type, quantity, note } = req.body;
    if (!['in', 'out'].includes(type) || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Укажите корректный тип и количество' });
    }
    if (type === 'in' && req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Приход товара может оформлять только владелец' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const supply = await client.query('SELECT * FROM supplies WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (supply.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Расходник не найден' });
      }
      const current = Number(supply.rows[0].quantity);
      const delta = type === 'in' ? Number(quantity) : -Number(quantity);
      const nextQty = current + delta;
      if (nextQty < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Недостаточно остатка на складе' });
      }

      await client.query(
        'UPDATE supplies SET quantity = $1, updated_at = now() WHERE id = $2',
        [nextQty, req.params.id]
      );
      const tx = await client.query(
        `INSERT INTO supply_transactions (supply_id, type, quantity, note, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [req.params.id, type, quantity, note || null, req.user.id]
      );
      await client.query('COMMIT');
      res.status(201).json(tx.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

module.exports = router;
