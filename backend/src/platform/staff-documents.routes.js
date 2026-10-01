const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { logEvent } = require('../core/eventLog');
const { registerDeadline } = require('../core/deadlines');
const { uploadDocument } = require('../core/uploads');
const { saveDocumentFile, getFileUrl, signFileUrl } = require('../core/fileStorage');

// criminal_record_certificate — миграция 0123, для детских ниш. У справки о
// несудимости нет законного срока действия (нужна при приёме, ст. 351.1 ТК
// РФ) — вместо expires_at хранится issued_on, и напоминание не ставится.
// Медкнижки и медосмотры убраны 01.10.2026 (миграция 0125): даты и сканы —
// сведения о здоровье, не храним. Вместо них — напоминание раз в квартал
// проверить медкнижки (scripts/dailyOperationsNudges.js).
const DOC_LABELS = {
  certificate: 'Сертификат',
  employment_contract: 'Срочный договор',
  criminal_record_certificate: 'Справка об отсутствии судимости',
};
const DOC_TYPES = Object.keys(DOC_LABELS);
const NO_EXPIRY_TYPES = ['criminal_record_certificate'];

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}
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
  if (!doc.expires_at) return;
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
      `SELECT sd.id, sd.membership_id, sd.doc_type, sd.title, sd.expires_at,
              to_char(sd.issued_on, 'YYYY-MM-DD') AS issued_on, sd.file_url, sd.created_at
       FROM staff_documents sd
       WHERE ${where}
       ORDER BY sd.expires_at ASC`,
      params
    );
    res.json(rows.map((r) => ({ ...r, file_url: r.file_url ? signFileUrl(r.file_url) : null })));
  })
);

router.post(
  '/',
  requireRole('owner'),
  uploadDocument,
  asyncHandler(async (req, res) => {
    const { membershipId, docType, title, expiresAt, issuedOn } = req.body;
    const noExpiry = NO_EXPIRY_TYPES.includes(docType);
    if (!membershipId || !DOC_TYPES.includes(docType)) {
      return res.status(400).json({ error: 'Укажите сотрудника и тип документа' });
    }
    if (noExpiry ? !isDate(issuedOn) : !isDate(expiresAt)) {
      return res.status(400).json({ error: noExpiry ? 'Укажите дату выдачи справки' : 'Укажите дату истечения' });
    }

    const member = await pool.query(
      `SELECT u.name FROM memberships m LEFT JOIN users u ON u.id = m.user_id
       WHERE m.id = $1 AND m.company_id = $2`,
      [membershipId, req.tenant.companyId]
    );
    if (member.rows.length === 0) {
      return res.status(400).json({ error: 'Сотрудник не найден в этой компании' });
    }

    // Скан справки о несудимости не храним — сведения о судимости охраняются
    // отдельно (ст. 10 152-ФЗ), достаточно даты выдачи.
    let fileUrl = null;
    if (req.file && !noExpiry) {
      const filename = await saveDocumentFile(req.file.buffer, req.file.mimetype);
      fileUrl = getFileUrl(filename);
    }

    const { rows } = await pool.query(
      `INSERT INTO staff_documents (company_id, membership_id, doc_type, title, expires_at, issued_on, created_by_user_id, file_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, membership_id, doc_type, title, to_char(expires_at, 'YYYY-MM-DD') AS expires_at,
                 to_char(issued_on, 'YYYY-MM-DD') AS issued_on, file_url, created_at`,
      [req.tenant.companyId, membershipId, docType, title || null, noExpiry ? null : expiresAt, noExpiry ? issuedOn : null, req.user.id, fileUrl]
    );
    const doc = { ...rows[0], file_url: rows[0].file_url ? signFileUrl(rows[0].file_url) : null };

    await syncDeadline({ companyId: req.tenant.companyId, doc: rows[0], employeeName: member.rows[0].name || 'Сотрудник' });
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
  uploadDocument,
  asyncHandler(async (req, res) => {
    const { title, expiresAt, issuedOn } = req.body;
    if ((expiresAt && !isDate(expiresAt)) || (issuedOn && !isDate(issuedOn))) {
      return res.status(400).json({ error: 'Некорректная дата' });
    }

    const current = await pool.query('SELECT doc_type FROM staff_documents WHERE id = $1 AND company_id = $2', [req.params.id, req.tenant.companyId]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Документ не найден' });
    }
    let fileUrl = null;
    if (req.file && !NO_EXPIRY_TYPES.includes(current.rows[0].doc_type)) {
      const filename = await saveDocumentFile(req.file.buffer, req.file.mimetype);
      fileUrl = getFileUrl(filename);
    }

    const { rows } = await pool.query(
      `UPDATE staff_documents SET
         title = COALESCE($1, title),
         expires_at = CASE WHEN doc_type = 'criminal_record_certificate' THEN expires_at ELSE COALESCE($2, expires_at) END,
         file_url = COALESCE($3, file_url),
         issued_on = CASE WHEN doc_type = 'criminal_record_certificate' THEN COALESCE($6, issued_on) ELSE issued_on END
       WHERE id = $4 AND company_id = $5
       RETURNING id, membership_id, doc_type, title, to_char(expires_at, 'YYYY-MM-DD') AS expires_at,
                 to_char(issued_on, 'YYYY-MM-DD') AS issued_on, file_url, created_at`,
      [title !== undefined ? title || null : null, expiresAt || null, fileUrl, req.params.id, req.tenant.companyId, issuedOn || null]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Документ не найден' });
    }
    const doc = { ...rows[0], file_url: rows[0].file_url ? signFileUrl(rows[0].file_url) : null };

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
