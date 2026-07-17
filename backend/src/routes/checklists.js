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
    let query = 'SELECT * FROM checklists';
    const params = [];
    if (req.user.role !== 'owner') {
      query += ` WHERE role_target = $1 OR role_target = 'all'`;
      params.push(req.user.role);
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  })
);

router.post(
  '/',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { title, description, role_target, items } = req.body;
    if (!title || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Укажите название и хотя бы один пункт чек-листа' });
    }
    const result = await pool.query(
      `INSERT INTO checklists (title, description, role_target, items, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, description || null, role_target || 'master', JSON.stringify(items), req.user.id]
    );
    res.status(201).json(result.rows[0]);
  })
);

router.put(
  '/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { title, description, role_target, items } = req.body;
    const result = await pool.query(
      `UPDATE checklists SET
        title = COALESCE($1, title), description = $2,
        role_target = COALESCE($3, role_target),
        items = COALESCE($4, items)
       WHERE id = $5 RETURNING *`,
      [title, description || null, role_target, items ? JSON.stringify(items) : null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Чек-лист не найден' });
    }
    res.json(result.rows[0]);
  })
);

router.delete(
  '/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM checklists WHERE id = $1', [req.params.id]);
    res.status(204).end();
  })
);

// Выполнения чек-листов за дату. Владелец видит всех, мастер - только свои.
router.get(
  '/completions',
  asyncHandler(async (req, res) => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const conditions = ['completion_date = $1'];
    const params = [date];
    if (req.user.role !== 'owner') {
      conditions.push('user_id = $2');
      params.push(req.user.id);
    }
    const result = await pool.query(
      `SELECT cc.*, c.title, u.name AS user_name FROM checklist_completions cc
       JOIN checklists c ON c.id = cc.checklist_id
       JOIN users u ON u.id = cc.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY cc.created_at DESC`,
      params
    );
    res.json(result.rows);
  })
);

router.post(
  '/:id/complete',
  asyncHandler(async (req, res) => {
    const { checked_items, completed, date } = req.body;
    const completionDate = date || new Date().toISOString().slice(0, 10);
    const result = await pool.query(
      `INSERT INTO checklist_completions (checklist_id, user_id, completion_date, checked_items, completed)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (checklist_id, user_id, completion_date)
       DO UPDATE SET checked_items = EXCLUDED.checked_items, completed = EXCLUDED.completed
       RETURNING *`,
      [req.params.id, req.user.id, completionDate, JSON.stringify(checked_items || []), !!completed]
    );
    res.json(result.rows[0]);
  })
);

module.exports = router;
