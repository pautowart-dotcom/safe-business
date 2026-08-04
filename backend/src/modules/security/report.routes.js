const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../core/middleware/role');
const { requirePaidPlan } = require('../../core/middleware/subscription');
const { logEvent } = require('../../core/eventLog');
const repository = require('./content/repository');
const { mergeDocumentSections, mergeAttentionZones } = require('./content/mergeSections');
const { loadProfile } = require('./profile');
const { computeSecurityStatus } = require('./status');
const { buildReport } = require('./report/build');
const { renderPdf } = require('./report/pdf');

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

module.exports = router;
