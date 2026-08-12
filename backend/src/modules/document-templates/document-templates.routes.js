const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../core/middleware/role');
const { requireTestCompany } = require('../../core/middleware/testCompany');
const { logEvent } = require('../../core/eventLog');
const { encrypt } = require('../../core/crypto');
const { saveDocumentFile, getFileUrl, signFileUrl } = require('../../core/fileStorage');
const { loadProfile } = require('../security/profile');
const repository = require('./content/repository');
const { renderDocumentPdf } = require('./render');

const router = express.Router();

// Тихая обкатка (см. core/middleware/testCompany.js) — фича ещё не готова
// (1 шаблон из 5, без платного гейта), доступна только is_test-компаниям,
// пока не уберём этот middleware явным следующим шагом.
router.use(requireTestCompany);

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

router.post(
  '/generate',
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
    });
  })
);

router.get(
  '/generated',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, template_key, template_version, template_title, template_status_at_generation, generated_at, file_url
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
      }))
    );
  })
);

module.exports = router;
