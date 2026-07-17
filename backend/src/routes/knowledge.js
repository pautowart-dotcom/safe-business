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
    const { search, category } = req.query;
    const conditions = [];
    const params = [];
    let i = 1;
    if (search) { conditions.push(`(title ILIKE $${i} OR content ILIKE $${i})`); params.push(`%${search}%`); i++; }
    if (category) { conditions.push(`category = $${i++}`); params.push(category); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT id, title, category, created_at, updated_at FROM knowledge_articles ${where} ORDER BY updated_at DESC`,
      params
    );
    res.json(result.rows);
  })
);

router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      'SELECT DISTINCT category FROM knowledge_articles ORDER BY category'
    );
    res.json(result.rows.map((r) => r.category));
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await pool.query('SELECT * FROM knowledge_articles WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Статья не найдена' });
    }
    res.json(result.rows[0]);
  })
);

router.post(
  '/',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { title, category, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Укажите заголовок и содержание статьи' });
    }
    const result = await pool.query(
      `INSERT INTO knowledge_articles (title, category, content, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [title, category || 'Общее', content, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  })
);

router.put(
  '/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { title, category, content } = req.body;
    const result = await pool.query(
      `UPDATE knowledge_articles SET
        title = COALESCE($1, title), category = COALESCE($2, category),
        content = COALESCE($3, content), updated_at = now()
       WHERE id = $4 RETURNING *`,
      [title, category, content, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Статья не найдена' });
    }
    res.json(result.rows[0]);
  })
);

router.delete(
  '/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM knowledge_articles WHERE id = $1', [req.params.id]);
    res.status(204).end();
  })
);

module.exports = router;
