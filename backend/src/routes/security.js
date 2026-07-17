const express = require('express');
const pool = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();
router.use(requireAuth);

// --- Инциденты безопасности (санитария, пожарная безопасность, защита данных и т.д.) ---

router.get(
  '/incidents',
  asyncHandler(async (req, res) => {
    const { status, category } = req.query;
    const conditions = [];
    const params = [];
    let i = 1;
    if (status) { conditions.push(`si.status = $${i++}`); params.push(status); }
    if (category) { conditions.push(`si.category = $${i++}`); params.push(category); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT si.*, u.name AS reported_by_name FROM security_incidents si
       LEFT JOIN users u ON u.id = si.reported_by
       ${where} ORDER BY si.occurred_at DESC`,
      params
    );
    res.json(result.rows);
  })
);

router.post(
  '/incidents',
  asyncHandler(async (req, res) => {
    const { title, category, severity, description, occurred_at } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Укажите заголовок инцидента' });
    }
    const result = await pool.query(
      `INSERT INTO security_incidents (title, category, severity, description, reported_by, occurred_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, now())) RETURNING *`,
      [title, category || 'other', severity || 'low', description || null, req.user.id, occurred_at || null]
    );
    res.status(201).json(result.rows[0]);
  })
);

router.put(
  '/incidents/:id',
  asyncHandler(async (req, res) => {
    const { status, severity, description } = req.body;
    // Закрывать/менять статус инцидента может только владелец
    if (status && req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Менять статус инцидента может только владелец' });
    }
    const resolvedAt = status === 'resolved' ? 'now()' : 'resolved_at';
    const result = await pool.query(
      `UPDATE security_incidents SET
        status = COALESCE($1, status), severity = COALESCE($2, severity),
        description = COALESCE($3, description),
        resolved_at = CASE WHEN $1 = 'resolved' THEN now() ELSE resolved_at END
       WHERE id = $4 RETURNING *`,
      [status, severity, description, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Инцидент не найден' });
    }
    res.json(result.rows[0]);
  })
);

router.delete(
  '/incidents/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM security_incidents WHERE id = $1', [req.params.id]);
    res.status(204).end();
  })
);

// --- Стандарты и правила безопасности (пожарные, санитарные, защита данных) ---

router.get(
  '/standards',
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      'SELECT * FROM security_checklist_items WHERE active = true ORDER BY frequency, title'
    );
    res.json(result.rows);
  })
);

router.post(
  '/standards',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { title, description, frequency } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Укажите название правила' });
    }
    const result = await pool.query(
      `INSERT INTO security_checklist_items (title, description, frequency)
       VALUES ($1, $2, $3) RETURNING *`,
      [title, description || null, frequency || 'daily']
    );
    res.status(201).json(result.rows[0]);
  })
);

router.put(
  '/standards/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { title, description, frequency, active } = req.body;
    const result = await pool.query(
      `UPDATE security_checklist_items SET
        title = COALESCE($1, title), description = $2,
        frequency = COALESCE($3, frequency), active = COALESCE($4, active)
       WHERE id = $5 RETURNING *`,
      [title, description, frequency, active, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Правило не найдено' });
    }
    res.json(result.rows[0]);
  })
);

router.delete(
  '/standards/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM security_checklist_items WHERE id = $1', [req.params.id]);
    res.status(204).end();
  })
);

module.exports = router;
