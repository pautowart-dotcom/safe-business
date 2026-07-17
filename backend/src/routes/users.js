const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();
router.use(requireAuth);

// Только владелец видит и управляет списком сотрудников
router.get(
  '/',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      'SELECT id, name, email, phone, role, active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  })
);

router.post(
  '/',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { name, email, phone, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Заполните имя, email, пароль и роль' });
    }
    if (!['owner', 'master'].includes(role)) {
      return res.status(400).json({ error: 'Недопустимая роль' });
    }
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, phone, role, active, created_at`,
      [name, email, phone || null, hash, role]
    );
    res.status(201).json(result.rows[0]);
  })
);

router.put(
  '/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { name, phone, role, active, password } = req.body;
    const fields = [];
    const values = [];
    let i = 1;

    if (name !== undefined) { fields.push(`name = $${i++}`); values.push(name); }
    if (phone !== undefined) { fields.push(`phone = $${i++}`); values.push(phone); }
    if (role !== undefined) { fields.push(`role = $${i++}`); values.push(role); }
    if (active !== undefined) { fields.push(`active = $${i++}`); values.push(active); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      fields.push(`password_hash = $${i++}`);
      values.push(hash);
    }
    if (fields.length === 0) {
      return res.status(400).json({ error: 'Нечего обновлять' });
    }
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, name, email, phone, role, active, created_at`,
      values
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json(result.rows[0]);
  })
);

// Список мастеров для выпадающих списков (доступен всем авторизованным)
router.get(
  '/masters/list',
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT id, name FROM users WHERE role = 'master' AND active = true ORDER BY name`
    );
    res.json(result.rows);
  })
);

module.exports = router;
