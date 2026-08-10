const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../core/middleware/role');
const { requirePaidPlan } = require('../../core/middleware/subscription');
const { requireTestCompany } = require('../../core/middleware/testCompany');
const { logEvent } = require('../../core/eventLog');
const repository = require('./content/repository');
const { mergeDocumentSections, mergeAttentionZones } = require('./content/mergeSections');
const { loadProfile } = require('./profile');
const { computeSecurityStatus } = require('./status');
const { buildReport } = require('./report/build');
const { renderPdf } = require('./report/pdf');
const { buildRoadmap, NICHE_LABELS } = require('../roadmap/content/buildRoadmap');
const { renderRoadmapPdf } = require('../../platform/roadmapPdf');

const router = express.Router();

// См. security.routes.js — тот же owner-only гейт на весь модуль
// (политика конфиденциальности §8.4). requirePaidPlan ниже — независимая
// ось (подписка на платформу), не заменяет ролевую проверку.
router.use(requireRole('owner'));

// Отчёт всегда собирается по ТЕКУЩЕМУ состоянию (актуальные ниши профиля,
// последняя завершённая сессия каждой) — не только по нише той сессии,
// которую только что завершили. Если владелец, например, вчера добавил
// нишу и прошёл только её тест сегодня, а маникюр проходил месяц назад,
// отчёт всё равно объединяет обе — computeSecurityStatus.js уже считает
// именно так.
async function loadReportInputs(companyId, profile) {
  const status = await computeSecurityStatus(companyId);

  const sectionsPerNiche = await Promise.all(status.testedNiches.map((n) => repository.getMandatoryDocuments(n)));
  const zonesPerNiche = await Promise.all(status.testedNiches.map((n) => repository.getAttentionZones(n)));

  return {
    status,
    mandatoryDocuments: mergeDocumentSections(sectionsPerNiche.filter(Boolean)),
    attentionZones: mergeAttentionZones(zonesPerNiche.filter(Boolean)),
  };
}

router.post(
  '/sessions/:id/report',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM security_sessions WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
    const session = rows[0];
    if (!session) return res.status(404).json({ error: 'Сессия не найдена' });
    if (session.type !== 'paid' || session.status !== 'completed') {
      return res.status(400).json({ error: 'Отчёт формируется только для завершённого аудита' });
    }

    // Идемпотентно: у сессии не может быть больше одного отчёта (UNIQUE
    // session_id, миграция 0011). Содержимое отчёта детерминировано
    // (session+violations), поэтому при повторном вызове просто отдаём уже
    // существующую запись — без этого второй клик на "Скачать PDF" падал
    // с duplicate key на report_number.
    const existing = await pool.query(
      'SELECT id, report_number, generated_at FROM security_reports WHERE session_id = $1',
      [session.id]
    );
    if (existing.rows.length > 0) {
      const report = existing.rows[0];
      return res.status(200).json({
        id: report.id,
        reportNumber: report.report_number,
        generatedAt: report.generated_at,
        downloadUrl: `/api/modules/security/reports/${report.id}/download`,
      });
    }

    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const reportNumber = `AUD-${dateStamp}-${session.id}`;

    const { rows: reportRows } = await pool.query(
      `INSERT INTO security_reports (company_id, session_id, report_number)
       VALUES ($1, $2, $3) RETURNING id, report_number, generated_at`,
      [req.tenant.companyId, session.id, reportNumber]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'security',
      userId: req.user.id,
      entityType: 'security_report',
      entityId: reportRows[0].id,
      action: 'security_report.generated',
    });

    res.status(201).json({
      id: reportRows[0].id,
      reportNumber: reportRows[0].report_number,
      generatedAt: reportRows[0].generated_at,
      downloadUrl: `/api/modules/security/reports/${reportRows[0].id}/download`,
    });
  })
);

router.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, session_id, report_number, generated_at FROM security_reports WHERE company_id = $1 ORDER BY generated_at DESC`,
      [req.tenant.companyId]
    );
    res.json(rows);
  })
);

// PDF не хранится на диске — пересобирается из текущего состояния по
// требованию (данные детерминированы на момент скачивания — если владелец
// с тех пор устранил нарушение или прошёл ещё одну нишу, PDF это учтёт,
// хотя report_number/сама запись отчёта остаются привязаны к той сессии,
// после которой их впервые запросили — см. POST /sessions/:id/report).
//
// Сам тест и результат (индекс, зона, карта нарушений) бесплатны всем —
// paywall стоит только на этом роуте (скачивание файла), не на генерации
// записи отчёта (POST /sessions/:id/report) и не на /sessions/:id/result.
router.get(
  '/reports/:id/download',
  requirePaidPlan,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM security_reports WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
    const reportRow = rows[0];
    if (!reportRow) return res.status(404).json({ error: 'Отчёт не найден' });

    const profile = await loadProfile(req.tenant.companyId);
    const { status, mandatoryDocuments, attentionZones } = await loadReportInputs(req.tenant.companyId, profile);

    const report = await buildReport({
      niches: status.testedNiches,
      profile,
      score: status.answersWithBlocks.reduce((sum, a) => sum + a.points, 0),
      maxScore: status.answersWithBlocks.length,
      indexPercent: status.indexPercent,
      zone: status.zone,
      violations: status.violations,
      answersWithBlocks: status.answersWithBlocks,
      mandatoryDocuments,
      attentionZones,
      reportNumber: reportRow.report_number,
    });

    const pdfBuffer = await renderPdf(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${reportRow.report_number}.pdf"`);
    res.send(pdfBuffer);
  })
);

// "Открытие ещё одной точки" — 10.08.2026: раздел "Филиалы" в продукте убран
// (каждая новая точка — отдельная компания/подписка, см. Layout.jsx), поэтому
// это НЕ сущность и не новый раздел меню, а бесстейтовая генерация: берём уже
// известные ниши/юрформу/модель работы ИЗ ПРОФИЛЯ ТЕКУЩЕЙ компании (тот же
// loadProfile, что и выше) и строим тот же движок roadmap открытия
// (modules/roadmap/content/buildRoadmap.js — общий с публичным продуктом
// "Roadmap открытия бизнеса" для новичков, backend/src/platform/roadmap.routes.js),
// но БЕЗ шага регистрации юрлица (includeRegistration: false) — юрлицо уже
// есть, вопрос не про "как зарегистрироваться", а "что оформить на новом
// адресе". Ничего не сохраняется в БД — ничего не мешает пересчитать это
// снова с другими параметрами (?niche=...), нет риска рассинхронизации с
// текущим состоянием профиля.
function pickSupportedNiches(profile) {
  return profile.niches.filter((n) => NICHE_LABELS[n]);
}

// requireTestCompany — общий middleware (core/middleware/testCompany.js):
// is_test=true у компании (миграция 0067, PATCH /admin/companies/:id/test-flag)
// — иначе прямой вызов API в обход UI всё равно сработал бы у любой компании.

function buildCompanyOpeningRoadmap(profile, requestedNiche) {
  const supported = pickSupportedNiches(profile);
  const niche = requestedNiche && supported.includes(requestedNiche) ? requestedNiche : supported.length === 1 ? supported[0] : null;
  if (!niche) return null;
  // work_model: 'alone'|'employees'|'sublet'|'mixed' (Security.jsx, WORK_MODEL_OPTIONS)
  // — то же поле, что и остальной модуль безопасности уже использует для
  // employerOnly-гейтинга, отдельного вопроса не заводим.
  const hasEmployees = profile.workModel === 'employees' || profile.workModel === 'mixed';
  return buildRoadmap({ niche, legalForm: profile.legalForm, hasEmployees, includeRegistration: false });
}

router.get(
  '/opening-roadmap',
  requireTestCompany,
  asyncHandler(async (req, res) => {
    const profile = await loadProfile(req.tenant.companyId);
    if (!profile || !profile.legalForm) {
      return res.status(409).json({ error: 'Сначала пройдите сегментацию (ниша и форма работы)' });
    }
    const supported = pickSupportedNiches(profile);
    if (supported.length === 0) {
      return res.status(409).json({ error: 'Чек-лист открытия новой точки пока доступен только для ниш красоты' });
    }
    if (supported.length > 1 && !req.query.niche) {
      return res.json({ needNicheChoice: true, niches: supported.map((n) => ({ key: n, label: NICHE_LABELS[n] })) });
    }
    const roadmap = buildCompanyOpeningRoadmap(profile, req.query.niche);
    if (!roadmap) return res.status(400).json({ error: 'Укажите нишу' });
    res.json(roadmap);
  })
);

router.get(
  '/opening-roadmap/pdf',
  requireTestCompany,
  requirePaidPlan,
  asyncHandler(async (req, res) => {
    const profile = await loadProfile(req.tenant.companyId);
    if (!profile || !profile.legalForm) {
      return res.status(409).json({ error: 'Сначала пройдите сегментацию' });
    }
    const roadmap = buildCompanyOpeningRoadmap(profile, req.query.niche);
    if (!roadmap) return res.status(400).json({ error: 'Укажите нишу' });

    const pdfBuffer = await renderRoadmapPdf({
      nicheLabel: roadmap.nicheLabel,
      legalFormLabel: roadmap.legalFormLabel,
      generatedAt: new Date(),
      stages: roadmap.stages,
      disclaimer: roadmap.disclaimer,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="roadmap-novoy-tochki.pdf"');
    res.send(pdfBuffer);
  })
);

module.exports = router;
