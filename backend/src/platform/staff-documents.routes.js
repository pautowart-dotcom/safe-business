const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { logEvent } = require('../core/eventLog');
const { registerDeadline } = require('../core/deadlines');

const DOC_LABELS = { medical_book: 'Мед. книжка', certificate: 'Сертификат' };
const REMINDER_LEAD_DAYS = 14;

// Срок напоминания регистрируется сразу — за REMINDER_LEAD_DAYS до реальной
// даты истечения (а не в день, когда до истечения останется 2 недели: в
// движке дедлайнов нет отдельного "показывать с such date", он просто
// сортирует всё по due_date, так что запись на "дату напоминания" и есть
// правильное место записи в списке).
function minusDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function syncDeadline({ companyId, doc, employeeName }) {
  const label = DOC_LABELS[doc.doc_type] + (doc.title ? ` · ${doc.title}` : '');
  await registerDeadline({
    companyId,
    category: 'staff',
    title: `${label} — ${employeeName}: истекает ${doc.expires_at}`,
    dueDate: minusDays(doc.expires_at, REMINDER_LEAD_DAYS),
    relatedEntityType: 'staff_document',
    relatedEntityId: doc.id,
  });
}

const router = express.Router();
router.use(requireAuth, requireTenant);

// Владелец видит документы всех сотрудников; Администратор — тоже всех
// (только просмотр, редактирование ниже отсекается requireRole('owner'));
// Мастер — только свои (membershipId из query игнорируется).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const params = [req.tenant.companyId];
    let where = 'sd.company_id = $1';

    if (req.tenant.role === 'master') {
      params.push(req.tenant.membershipId);
      where += ` AND sd.membership_id = $${params.length}`;
    } else if (req.query.membershipId) {
      params.push(req.query.membershipId);
      where += ` AND sd.membership_id = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT sd.id, sd.membership_id, sd.doc_type, sd.title, sd.expires_at, sd.created_at
       FROM staff_documents sd
       WHERE ${where}
       ORDER BY sd.expires_at ASC`,
      params
    );
    res.json(rows);
  })
);

router.post(
  '/',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { membershipId, docType, title, expiresAt } = req.body;
    if (!membershipId || !['medical_book', 'certificate'].includes(docType) || !expiresAt) {
      return res.status(400).json({ error: 'Укажите сотрудника, тип документа и дату истечения' });
    }

    const member = await pool.query(
      `SELECT u.name FROM memberships m LEFT JOIN users u ON u.id = m.user_id
       WHERE m.id = $1 AND m.company_id = $2`,
      [membershipId, req.tenant.companyId]
    );
    if (member.rows.length === 0) {
      return res.status(400).json({ error: 'Сотрудник не найден в этой компании' });
    }

    const { rows } = await pool.query(
      `INSERT INTO staff_documents (company_id, membership_id, doc_type, title, expires_at, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, membership_id, doc_type, title, to_char(expires_at, 'YYYY-MM-DD') AS expires_at, created_at`,
      [req.tenant.companyId, membershipId, docType, title || null, expiresAt, req.user.id]
    );
    const doc = rows[0];

    await syncDeadline({ companyId: req.tenant.companyId, doc, employeeName: member.rows[0].name || 'Сотрудник' });
    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'staff_document',
      entityId: doc.id,
      action: 'staff_document.created',
    });

    res.status(201).json(doc);
  })
);

router.patch(
  '/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { title, expiresAt } = req.body;

    const { rows } = await pool.query(
      `UPDATE staff_documents SET
         title = COALESCE($1, title),
         expires_at = COALESCE($2, expires_at)
       WHERE id = $3 AND company_id = $4
       RETURNING id, membership_id, doc_type, title, to_char(expires_at, 'YYYY-MM-DD') AS expires_at, created_at`,
      [title !== undefined ? title || null : null, expiresAt || null, req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Документ не найден' });
    }
    const doc = rows[0];

    const member = await pool.query(
      `SELECT u.name FROM memberships m LEFT JOIN users u ON u.id = m.user_id WHERE m.id = $1`,
      [doc.membership_id]
    );
    await syncDeadline({ companyId: req.tenant.companyId, doc, employeeName: member.rows[0]?.name || 'Сотрудник' });
    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'staff_document',
      entityId: doc.id,
      action: 'staff_document.updated',
    });

    res.json(doc);
  })
);

router.delete(
  '/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM staff_documents WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Документ не найден' });
    }
    // Убираем связанное напоминание — иначе оно навсегда останется в
    // "Дедлайнах" без возможности снять его через UI (документа-источника
    // больше нет).
    await pool.query(`DELETE FROM deadlines WHERE related_entity_type = 'staff_document' AND related_entity_id = $1`, [
      req.params.id,
    ]);

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'staff_document',
      entityId: Number(req.params.id),
      action: 'staff_document.deleted',
    });

    res.status(204).end();
  })
);

module.exports = router;
