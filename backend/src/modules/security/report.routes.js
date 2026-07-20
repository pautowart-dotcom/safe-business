const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../core/middleware/role');
const { requirePaidPlan } = require('../../core/middleware/subscription');
const { logEvent } = require('../../core/eventLog');
const repository = require('./content/repository');
const { buildReport } = require('./report/build');
const { renderPdf } = require('./report/pdf');

const router = express.Router();

// См. security.routes.js — тот же owner-only гейт на весь модуль
// (политика конфиденциальности §8.4). requirePaidPlan ниже — независимая
// ось (подписка на платформу), не заменяет ролевую проверку.
router.use(requireRole('owner'));

async function loadProfile(companyId) {
  const { rows } = await pool.query('SELECT * FROM security_profiles WHERE company_id = $1', [companyId]);
  return rows[0]
    ? { legalForm: rows[0].legal_form, workModel: rows[0].work_model, segment: rows[0].segment, niche: rows[0].niche }
    : null;
}

// Собирает report/build.js входные данные для завершённой платной сессии:
// нарушения, найденные в ЭТОЙ сессии (с их текущим статусом open/resolved —
// он персистентен на компанию), и баллы по вопросам с привязкой к блоку.
async function loadReportInputs(session, profile) {
  const matrix = await repository.getViolationMatrix(session.niche);
  const violationsRes = await pool.query(
    `SELECT violation_code, status FROM security_violations
     WHERE company_id = $1 AND (first_session_id = $2 OR last_confirmed_session_id = $2)`,
    [session.company_id, session.id]
  );
  const violations = violationsRes.rows
    .map((row) => {
      const details = matrix.find((v) => v.code === row.violation_code);
      return details ? { ...details, status: row.status } : null;
    })
    .filter(Boolean);

  const questions = await repository.getPaidQuestions(session.niche);
  const answersRes = await pool.query('SELECT question_code, points FROM security_answers WHERE session_id = $1', [session.id]);
  const answersWithBlocks = answersRes.rows.map((row) => ({
    code: row.question_code,
    points: row.points,
    block: questions.find((q) => q.code === row.question_code)?.block,
  }));

  return { violations, answersWithBlocks };
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

// PDF не хранится на диске — пересобирается из session+violations по
// требованию (данные детерминированы, дешевле не держать файловое хранилище
// для MVP). Если позже понадобится кэш/S3 — меняется только этот роут.
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

    const sessionRes = await pool.query('SELECT * FROM security_sessions WHERE id = $1', [reportRow.session_id]);
    const session = sessionRes.rows[0];
    const profile = await loadProfile(req.tenant.companyId);

    const { violations, answersWithBlocks } = await loadReportInputs(session, profile);
    const report = await buildReport({
      session,
      profile,
      violations,
      answersWithBlocks,
      reportNumber: reportRow.report_number,
    });

    const pdfBuffer = await renderPdf(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${reportRow.report_number}.pdf"`);
    res.send(pdfBuffer);
  })
);

module.exports = router;
