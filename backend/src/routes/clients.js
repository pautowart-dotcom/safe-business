const express = require('express');
const pool = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search } = req.query;
    let query = 'SELECT * FROM clients';
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      query += ' WHERE name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1';
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const client = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    if (client.rows.length === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    const visits = await pool.query(
      `SELECT v.*, u.name AS master_name FROM visits v
       LEFT JOIN users u ON u.id = v.master_id
       WHERE v.client_id = $1 ORDER BY v.scheduled_at DESC`,
      [req.params.id]
    );
    res.json({ ...client.rows[0], visits: visits.rows });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, phone, email, birthday, notes } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Укажите имя клиента' });
    }
    const result = await pool.query(
      `INSERT INTO clients (name, phone, email, birthday, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, phone || null, email || null, birthday || null, notes || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, phone, email, birthday, notes } = req.body;
    const result = await pool.query(
      `UPDATE clients SET name = COALESCE($1, name), phone = $2, email = $3,
       birthday = $4, notes = $5 WHERE id = $6 RETURNING *`,
      [name, phone || null, email || null, birthday || null, notes || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    res.json(result.rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.status(204).end();
  })
);

module.exports = router;
