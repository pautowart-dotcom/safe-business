const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../core/middleware/role');
const { requireAddon } = require('../../core/middleware/addon');
const { ADDON_KEY } = require('./addonKey');
const { logEvent } = require('../../core/eventLog');
const { logAudit } = require('../../core/auditLog');
const { encrypt } = require('../../core/crypto');
const { saveDocumentFile, getFileUrl, signFileUrl } = require('../../core/fileStorage');
const { loadProfile } = require('../security/profile');
const repository = require('./content/repository');
const { renderDocumentPdf } = require('./render');

const router = express.Router();

// Тихая обкатка снята (13.08.2026, решение владельца) — доступно всем
// компаниям. Шаблоны со статусом draft показываются с пометкой "бета" в
// интерфейсе и в самом PDF (render.js), не скрываются целиком.

// Owner-only — те же причины, что и у всего модуля security (профиль
// конфиденциальности §8.4): здесь тоже данные компании и сгенерированные
// официальные документы, не повседневная операционка мастера/администратора.
router.use(requireRole('owner'));

// "Программа сама выбирает" (а не каталог, где клиент листает и выбирает
// сам) — список шаблонов уже отфильтрован по данным, которые компания
// ввела в разделе "Безопасность" (профиль сегментации), тем же полем
// employerOnly, что и в справочнике обязательных документов
// (security/content/pdf/mandatory-documents/*.js).
router.get(
  '/templates',
  asyncHandler(async (req, res) => {
    const profile = await loadProfile(req.tenant.companyId);
    if (!profile || profile.niches.length === 0) {
      return res.json([]);
    }
    const hasEmployees = profile.workModel === 'employees' || profile.workModel === 'mixed';

    const perNiche = await Promise.all(profile.niches.map((n) => repository.getTemplatesForNiche(n)));
    const templates = perNiche
      .flat()
      .filter((t) => !t.employerOnly || hasEmployees)
      .map((t) => ({
        key: t.key,
        niche: t.niche,
        title: t.title,
        version: t.version,
        status: t.status,
        reviewedBy: t.reviewedBy,
        reviewedAt: t.reviewedAt,
        lawReference: t.lawReference,
        fields: t.fields,
      }));

    res.json(templates);
  })
);

// Список шаблонов (выше) бесплатен — как и сам тест безопасности, "что вам
// нужно" не должно быть платным барьером. Платно именно создание документа
// (requireAddon), тем же принципом, что requirePaidPlan на скачивании PDF
// отчёта безопасности — только здесь разовая покупка, а не подписка
// (core/addons.js).
router.post(
  '/generate',
  requireAddon(ADDON_KEY),
  asyncHandler(async (req, res) => {
    const { templateKey, data } = req.body;
    const template = await repository.getTemplate(templateKey);
    if (!template) return res.status(400).json({ error: 'Неизвестный шаблон' });

    const profile = await loadProfile(req.tenant.companyId);
    if (!profile || !profile.niches.includes(template.niche)) {
      return res.status(403).json({ error: 'Этот шаблон не относится к вашей нише' });
    }

    const values = data && typeof data === 'object' ? data : {};
    const missing = template.fields.filter((f) => f.required && !String(values[f.key] || '').trim());
    if (missing.length > 0) {
      return res.status(400).json({ error: `Заполните обязательные поля: ${missing.map((f) => f.label).join(', ')}` });
    }

    const generatedAt = new Date();
    const pdfBuffer = await renderDocumentPdf({ template, data: values, generatedAt });
    const filename = await saveDocumentFile(pdfBuffer, 'application/pdf');

    const { rows } = await pool.query(
      `INSERT INTO generated_documents
         (company_id, template_key, template_version, template_title, template_status_at_generation,
          law_reference_at_generation, data_enc, file_url, generated_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, generated_at`,
      [
        req.tenant.companyId,
        template.key,
        template.version,
        template.title,
        template.status,
        template.lawReference || null,
        encrypt(JSON.stringify(values)),
        getFileUrl(filename),
        req.user.id,
      ]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'document-templates',
      userId: req.user.id,
      entityType: 'generated_document',
      entityId: rows[0].id,
      action: 'generated_document.created',
    });

    res.status(201).json({
      id: rows[0].id,
      templateTitle: template.title,
      status: template.status,
      generatedAt: rows[0].generated_at,
      downloadUrl: signFileUrl(getFileUrl(filename)),
      securityDocumentId: null,
    });
  })
);

router.get(
  '/generated',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, template_key, template_version, template_title, template_status_at_generation, generated_at, file_url, security_document_id
       FROM generated_documents WHERE company_id = $1 ORDER BY generated_at DESC`,
      [req.tenant.companyId]
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        templateKey: r.template_key,
        templateVersion: r.template_version,
        templateTitle: r.template_title,
        status: r.template_status_at_generation,
        generatedAt: r.generated_at,
        downloadUrl: signFileUrl(r.file_url),
        securityDocumentId: r.security_document_id,
      }))
    );
  })
);

// Удаляет только запись из истории генерации (аудиторский след себе же,
// не третьей стороне) — если документ уже был добавлен в "Мои документы"
// (security_document_id), та копия НЕ трогается, у неё свой независимый
// жизненный цикл (см. DELETE /modules/security/documents/:id). Файл на
// диске не удаляется — тот же принцип, что и у DELETE /documents/:id
// в security.routes.js (там тоже только запись в БД, без deleteFile).
router.delete(
  '/generated/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      'DELETE FROM generated_documents WHERE id = $1 AND company_id = $2',
      [req.params.id, req.tenant.companyId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Документ не найден' });

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'document-templates',
      userId: req.user.id,
      entityType: 'generated_document',
      entityId: Number(req.params.id),
      action: 'generated_document.deleted',
    });
    await logAudit({
      companyId: req.tenant.companyId,
      userId: req.user.id,
      action: 'generated_document.deleted',
      entityType: 'generated_document',
      entityId: Number(req.params.id),
    });

    res.status(204).end();
  })
);

// Владелец сам решает добавлять ли сгенерированный документ во вкладку
// "Документы" раздела "Безопасность" (security_documents) — не делаем это
// автоматически при генерации: документ могли сформировать "на пробу",
// не собираясь его использовать. Один сгенерированный документ можно
// добавить только один раз (security_document_id — см. миграцию 0076),
// повторный вызов — 409, а не второй дубликат в "Моих документах".
router.post(
  '/generated/:id/add-to-documents',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, template_key, template_title, file_url, security_document_id
       FROM generated_documents WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.tenant.companyId]
    );
    const doc = rows[0];
    if (!doc) return res.status(404).json({ error: 'Документ не найден' });
    if (doc.security_document_id) return res.status(409).json({ error: 'Уже добавлен в «Мои документы»' });

    const template = await repository.getTemplate(doc.template_key);
    const category = template?.documentCategory || 'Дополнительно';

    const { rows: inserted } = await pool.query(
      `INSERT INTO security_documents (company_id, category, name, file_url, uploaded_by_user_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.tenant.companyId, category, doc.template_title, doc.file_url, req.user.id]
    );
    await pool.query('UPDATE generated_documents SET security_document_id = $1 WHERE id = $2', [inserted[0].id, doc.id]);

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'security',
      userId: req.user.id,
      entityType: 'security_document',
      entityId: inserted[0].id,
      action: 'security_document.created',
    });

    res.status(201).json({ securityDocumentId: inserted[0].id, category });
  })
);

module.exports = router;
