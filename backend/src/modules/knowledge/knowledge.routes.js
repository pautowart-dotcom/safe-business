const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const emptyToNull = require('../../utils/emptyToNull');
const { requireRole } = require('../../core/middleware/role');
const { logEvent } = require('../../core/eventLog');

const router = express.Router();

// Разделы со списком статей (без текста статьи — для лёгкого списка).
// Читают обе роли, редактирует только владелец (README: "База знаний").
router.get(
  '/sections',
  asyncHandler(async (req, res) => {
    const sections = await pool.query(
      'SELECT id, name, sort_order, created_at FROM knowledge_sections WHERE company_id = $1 ORDER BY sort_order, name',
      [req.tenant.companyId]
    );
    const articles = await pool.query(
      `SELECT id, section_id, title, sort_order, updated_at FROM knowledge_articles
       WHERE company_id = $1 ORDER BY section_id, sort_order, title`,
      [req.tenant.companyId]
    );
    const articlesBySection = {};
    for (const article of articles.rows) {
      (articlesBySection[article.section_id] ||= []).push(article);
    }
    res.json(sections.rows.map((s) => ({ ...s, articles: articlesBySection[s.id] || [] })));
  })
);

router.post(
  '/sections',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { name, sortOrder } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Укажите название раздела' });
    }
    const { rows } = await pool.query(
      `INSERT INTO knowledge_sections (company_id, name, sort_order)
       VALUES ($1, $2, $3) RETURNING id, name, sort_order, created_at`,
      [req.tenant.companyId, name, sortOrder || 0]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'knowledge',
      userId: req.user.id,
      entityType: 'knowledge_section',
      entityId: rows[0].id,
      action: 'knowledge_section.created',
    });

    res.status(201).json({ ...rows[0], articles: [] });
  })
);

router.patch(
  '/sections/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { name, sortOrder } = req.body;
    const { rows } = await pool.query(
      `UPDATE knowledge_sections SET name = COALESCE($1, name), sort_order = COALESCE($2, sort_order)
       WHERE id = $3 AND company_id = $4
       RETURNING id, name, sort_order, created_at`,
      [name || null, emptyToNull(sortOrder), req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Раздел не найден' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'knowledge',
      userId: req.user.id,
      entityType: 'knowledge_section',
      entityId: rows[0].id,
      action: 'knowledge_section.updated',
    });

    res.json(rows[0]);
  })
);

router.delete(
  '/sections/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      'DELETE FROM knowledge_sections WHERE id = $1 AND company_id = $2',
      [req.params.id, req.tenant.companyId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Раздел не найден' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'knowledge',
      userId: req.user.id,
      entityType: 'knowledge_section',
      entityId: Number(req.params.id),
      action: 'knowledge_section.deleted',
    });

    res.status(204).end();
  })
);

router.get(
  '/articles/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, section_id, title, content, sort_order, created_at, updated_at
       FROM knowledge_articles WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Статья не найдена' });
    }
    res.json(rows[0]);
  })
);

router.post(
  '/sections/:id/articles',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { title, content, sortOrder } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Укажите заголовок статьи' });
    }
    const section = await pool.query('SELECT 1 FROM knowledge_sections WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
    if (section.rows.length === 0) {
      return res.status(404).json({ error: 'Раздел не найден' });
    }

    const { rows } = await pool.query(
      `INSERT INTO knowledge_articles (company_id, section_id, title, content, sort_order, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, section_id, title, content, sort_order, created_at, updated_at`,
      [req.tenant.companyId, req.params.id, title, content || '', sortOrder || 0, req.user.id]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'knowledge',
      userId: req.user.id,
      entityType: 'knowledge_article',
      entityId: rows[0].id,
      action: 'knowledge_article.created',
    });

    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/articles/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { title, content, sortOrder, sectionId } = req.body;
    const { rows } = await pool.query(
      `UPDATE knowledge_articles SET
         title = COALESCE($1, title),
         content = COALESCE($2, content),
         sort_order = COALESCE($3, sort_order),
         section_id = COALESCE($4, section_id),
         updated_at = now()
       WHERE id = $5 AND company_id = $6
       RETURNING id, section_id, title, content, sort_order, created_at, updated_at`,
      [title || null, content !== undefined ? content : null, emptyToNull(sortOrder), sectionId || null, req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Статья не найдена' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'knowledge',
      userId: req.user.id,
      entityType: 'knowledge_article',
      entityId: rows[0].id,
      action: 'knowledge_article.updated',
    });

    res.json(rows[0]);
  })
);

router.delete(
  '/articles/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM knowledge_articles WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Статья не найдена' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'knowledge',
      userId: req.user.id,
      entityType: 'knowledge_article',
      entityId: Number(req.params.id),
      action: 'knowledge_article.deleted',
    });

    res.status(204).end();
  })
);

module.exports = router;
