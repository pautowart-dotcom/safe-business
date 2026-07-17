const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../core/middleware/role');
const { logEvent } = require('../../core/eventLog');

const router = express.Router();

// Шаблоны + пункты видят обе роли (мастеру нужно видеть, что отмечать),
// но редактирует их только владелец (README: "Чек-листы").
router.get(
  '/templates',
  asyncHandler(async (req, res) => {
    const templates = await pool.query(
      'SELECT id, name, description, active, created_at FROM checklist_templates WHERE company_id = $1 ORDER BY name',
      [req.tenant.companyId]
    );
    const items = await pool.query(
      'SELECT id, template_id, label, sort_order FROM checklist_items WHERE company_id = $1 ORDER BY template_id, sort_order',
      [req.tenant.companyId]
    );
    const itemsByTemplate = {};
    for (const item of items.rows) {
      (itemsByTemplate[item.template_id] ||= []).push(item);
    }
    res.json(templates.rows.map((t) => ({ ...t, items: itemsByTemplate[t.id] || [] })));
  })
);

router.post(
  '/templates',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Укажите название чек-листа' });
    }
    const { rows } = await pool.query(
      `INSERT INTO checklist_templates (company_id, name, description)
       VALUES ($1, $2, $3) RETURNING id, name, description, active, created_at`,
      [req.tenant.companyId, name, description || null]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'checklists',
      userId: req.user.id,
      entityType: 'checklist_template',
      entityId: rows[0].id,
      action: 'checklist_template.created',
    });

    res.status(201).json({ ...rows[0], items: [] });
  })
);

router.patch(
  '/templates/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { name, description, active } = req.body;
    const { rows } = await pool.query(
      `UPDATE checklist_templates SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         active = COALESCE($3, active)
       WHERE id = $4 AND company_id = $5
       RETURNING id, name, description, active, created_at`,
      [name || null, description || null, active ?? null, req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Чек-лист не найден' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'checklists',
      userId: req.user.id,
      entityType: 'checklist_template',
      entityId: rows[0].id,
      action: 'checklist_template.updated',
    });

    res.json(rows[0]);
  })
);

router.delete(
  '/templates/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      'DELETE FROM checklist_templates WHERE id = $1 AND company_id = $2',
      [req.params.id, req.tenant.companyId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Чек-лист не найден' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'checklists',
      userId: req.user.id,
      entityType: 'checklist_template',
      entityId: Number(req.params.id),
      action: 'checklist_template.deleted',
    });

    res.status(204).end();
  })
);

router.post(
  '/templates/:id/items',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { label, sortOrder } = req.body;
    if (!label) {
      return res.status(400).json({ error: 'Укажите текст пункта' });
    }
    const template = await pool.query(
      'SELECT 1 FROM checklist_templates WHERE id = $1 AND company_id = $2',
      [req.params.id, req.tenant.companyId]
    );
    if (template.rows.length === 0) {
      return res.status(404).json({ error: 'Чек-лист не найден' });
    }

    const { rows } = await pool.query(
      `INSERT INTO checklist_items (template_id, company_id, label, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING id, template_id, label, sort_order`,
      [req.params.id, req.tenant.companyId, label, sortOrder || 0]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'checklists',
      userId: req.user.id,
      entityType: 'checklist_item',
      entityId: rows[0].id,
      action: 'checklist_item.created',
    });

    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/items/:itemId',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { label, sortOrder } = req.body;
    const { rows } = await pool.query(
      `UPDATE checklist_items SET label = COALESCE($1, label), sort_order = COALESCE($2, sort_order)
       WHERE id = $3 AND company_id = $4
       RETURNING id, template_id, label, sort_order`,
      [label || null, sortOrder ?? null, req.params.itemId, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Пункт не найден' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'checklists',
      userId: req.user.id,
      entityType: 'checklist_item',
      entityId: rows[0].id,
      action: 'checklist_item.updated',
    });

    res.json(rows[0]);
  })
);

router.delete(
  '/items/:itemId',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM checklist_items WHERE id = $1 AND company_id = $2', [
      req.params.itemId,
      req.tenant.companyId,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Пункт не найден' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'checklists',
      userId: req.user.id,
      entityType: 'checklist_item',
      entityId: Number(req.params.itemId),
      action: 'checklist_item.deleted',
    });

    res.status(204).end();
  })
);

// Отметки: владелец видит все (README: "просмотр всех отметок"), мастер — только свои.
router.get(
  '/marks',
  asyncHandler(async (req, res) => {
    const params = [req.tenant.companyId];
    let where = 'cm.company_id = $1';

    if (req.tenant.role === 'master') {
      params.push(req.tenant.membershipId);
      where += ` AND cm.membership_id = $${params.length}`;
    } else if (req.query.membershipId) {
      params.push(req.query.membershipId);
      where += ` AND cm.membership_id = $${params.length}`;
    }

    if (req.query.templateId) {
      params.push(req.query.templateId);
      where += ` AND ci.template_id = $${params.length}`;
    }

    const date = req.query.date || new Date().toISOString().slice(0, 10);
    params.push(date);
    where += ` AND cm.mark_date = $${params.length}`;

    const { rows } = await pool.query(
      `SELECT cm.id, cm.item_id, ci.label, ci.template_id, cm.membership_id, u.name AS master_name,
              cm.mark_date, cm.checked, cm.checked_at
       FROM checklist_marks cm
       JOIN checklist_items ci ON ci.id = cm.item_id
       JOIN memberships m ON m.id = cm.membership_id
       LEFT JOIN users u ON u.id = m.user_id
       WHERE ${where}
       ORDER BY ci.template_id, ci.sort_order`,
      params
    );
    res.json(rows);
  })
);

// Отметка выполнения пункта — только мастер, только за себя (README:
// "отметка выполнения своих чек-листов"). Один мастер — один пункт — один
// день = одна запись (UNIQUE в схеме), повторная отметка просто обновляет её.
router.post(
  '/items/:itemId/mark',
  requireRole('master'),
  asyncHandler(async (req, res) => {
    const checked = req.body.checked !== false;
    const date = req.body.date || new Date().toISOString().slice(0, 10);

    const item = await pool.query('SELECT id FROM checklist_items WHERE id = $1 AND company_id = $2', [
      req.params.itemId,
      req.tenant.companyId,
    ]);
    if (item.rows.length === 0) {
      return res.status(404).json({ error: 'Пункт чек-листа не найден' });
    }

    const { rows } = await pool.query(
      `INSERT INTO checklist_marks (company_id, item_id, membership_id, mark_date, checked, checked_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (item_id, membership_id, mark_date)
       DO UPDATE SET checked = EXCLUDED.checked, checked_at = now()
       RETURNING id, item_id, membership_id, mark_date, checked, checked_at`,
      [req.tenant.companyId, req.params.itemId, req.tenant.membershipId, date, checked]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'checklists',
      userId: req.user.id,
      entityType: 'checklist_mark',
      entityId: rows[0].id,
      action: checked ? 'checklist_item.checked' : 'checklist_item.unchecked',
    });

    res.json(rows[0]);
  })
);

module.exports = router;
