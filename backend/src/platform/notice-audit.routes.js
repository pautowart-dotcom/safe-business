// Публичный разбор бумаги от проверяющего (22.09.2026, идея владельца) —
// вход для рекламы без регистрации: человек загружает предписание/акт,
// видит разбор и список ниш, для которых упомянутые нормы уже есть в
// продукте, дальше идёт в бесплатный тест или регистрацию.
//
// Отличия от owner-only версии (modules/security/inspections.routes.js):
//  - без company/tenant — связь не со статусами нарушений конкретного
//    бизнеса, а генерическая: "эти нормы уже есть в тесте для ниш X, Y";
//  - без ИИ-пересказа — только детерминированный разбор (extractHints).
//    Публичный неаутентифицированный эндпоинт — лишняя причина не тратить
//    деньги на ИИ и не рисковать доверием к содержанию, которое никто не
//    проверял; ИИ-пересказ остаётся частью подписки;
//  - файл не сохраняется нигде, как и в owner-only версии;
//  - защита: невидимая капча + отдельный строгий лимит по IP (OCR и чтение
//    файла стоят денег на каждый вызов).
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { uploadInspectionNotice } = require('../core/uploads');
const { extractText } = require('../modules/security/document-risk-check/extractText');
const { ocrExtractText, isAiConfigured: isOcrConfigured } = require('../core/documentDateExtract');
const { moscowDateStr } = require('../utils/moscowDate');
const { buildCitationIndex, extractCitations } = require('../core/citedLawReferences');
const { SEGMENTS } = require('../modules/security/content/segments');
const { checkNoticeAuditAllowed, recordNoticeAudit } = require('../core/loginRateLimit');
const { requireCaptcha } = require('../core/captcha');
const analyze = require('../modules/security/inspection-notice/analyze');

const router = express.Router();

const MAX_NOTICE_CHARS = 12000;

const NICHE_LABELS = Object.fromEntries(
  SEGMENTS.flatMap((s) => s.niches.map((n) => [n.key, n.label]))
);

// Генерическая версия buildEcosystemLinks (inspections.routes.js) — без
// company, поэтому вместо "устранено/не устранено у вас" показываем "эти
// нормы уже разбираются в тесте для ниш: …".
async function buildPublicEcosystemLinks(text) {
  const cited = new Map();
  for (const c of extractCitations(text)) {
    if (c.type === 'fz' || c.type === 'pp') cited.set(`${c.type}:${c.number}`, c);
  }
  if (cited.size === 0) return { citedNorms: [], relatedNiches: [] };

  const index = await buildCitationIndex();
  const inRegistry = new Set(index.map((e) => `${e.type}:${e.number}`));
  const citedNorms = [...cited.values()].map((c) => ({
    label: c.type === 'fz' ? `${c.number}-ФЗ` : `ПП РФ №${c.number}`,
    inRegistry: inRegistry.has(`${c.type}:${c.number}`),
  }));

  const byNiche = new Map();
  for (const e of index) {
    if (!cited.has(`${e.type}:${e.number}`) || !e.violationTitle) continue;
    if (!byNiche.has(e.niche)) byNiche.set(e.niche, new Set());
    if (byNiche.get(e.niche).size < 2) byNiche.get(e.niche).add(e.violationTitle);
  }
  const relatedNiches = [...byNiche.entries()]
    .slice(0, 6)
    .map(([key, titles]) => ({ key, label: NICHE_LABELS[key] || key, examples: [...titles] }));

  return { citedNorms, relatedNiches };
}

router.post(
  '/analyze',
  requireCaptcha,
  (req, res, next) => uploadInspectionNotice(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Не удалось принять файл' });
    next();
  }),
  asyncHandler(async (req, res) => {
    if (!(await checkNoticeAuditAllowed(req.ip))) {
      return res.status(429).json({ error: 'Слишком много разборов с вашего адреса. Попробуйте позже или зарегистрируйтесь — в подписке лимит выше.' });
    }
    if (!req.file) return res.status(400).json({ error: 'Файл не передан' });
    await recordNoticeAudit(req.ip);

    let text = '';
    try {
      if (req.file.mimetype.startsWith('image/')) {
        if (!isOcrConfigured()) return res.status(503).json({ error: 'Распознавание фото пока не настроено — загрузите PDF или DOCX' });
        text = await ocrExtractText(req.file.buffer, req.file.mimetype);
      } else {
        text = await extractText(req.file.buffer, req.file.mimetype);
      }
    } catch (err) {
      console.error('notice-audit/analyze: text extraction failed', err.message);
      return res.status(422).json({ error: 'Не удалось прочитать файл. Попробуйте другой файл' });
    }
    text = (text || '').replace(/\s+\n/g, '\n').trim();
    if (text.length < 80) {
      return res.status(422).json({
        error: 'В файле почти нет читаемого текста. Для скана или фото приложите изображение хорошего качества (JPG/PNG)',
      });
    }
    if (text.length > MAX_NOTICE_CHARS) text = text.slice(0, MAX_NOTICE_CHARS);

    const hints = analyze.extractHints(text, moscowDateStr());
    const analysis = analyze.mergeAnalysis(hints, null);
    const suggestion = {
      inspectedOn: analysis.inspectedOn,
      authority: analysis.authority,
      areas: analysis.areas,
      outcome: analyze.suggestOutcome(analysis),
      fixDueDate: analysis.deadlineDate,
      fineAmount: analysis.fineAmount,
    };
    const links = await buildPublicEcosystemLinks(text);

    res.json({
      analysis: { summary: analysis.summary, findings: analysis.findings, kind: analysis.kind, koapArticles: analysis.koapArticles },
      suggestion,
      ...links,
    });
  })
);

module.exports = router;
