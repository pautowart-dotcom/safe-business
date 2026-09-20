const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../core/middleware/role');
const { encrypt, decrypt } = require('../../core/crypto');
const { logEvent } = require('../../core/eventLog');
const { registerDeadline, clearAction } = require('../../core/deadlines');
const { uploadInspectionNotice } = require('../../core/uploads');
const { extractText } = require('./document-risk-check/extractText');
const { ocrExtractText, isAiConfigured: isOcrConfigured } = require('../../core/documentDateExtract');
const yandexAssist = require('../../core/yandexAssist');
const { isSubscriptionActive } = require('../../core/middleware/subscription');
const { isOverDailyEventLimit } = require('../../core/aiUsageLimit');
const { moscowDateStr } = require('../../utils/moscowDate');
const { buildCitationIndex, extractCitations } = require('../../core/citedLawReferences');
const analyze = require('./inspection-notice/analyze');

const router = express.Router();

// История проверок (19.09.2026, идея владельца) — та же граница, что у всего
// модуля "Безопасность" (owner-only, политика конфиденциальности §8.4):
// сведения о проверках компании не менее чувствительны, чем результаты
// теста.
router.use(requireRole('owner'));

const AUTHORITIES = ['rospotrebnadzor', 'fire_inspection', 'labor_inspection', 'roskomnadzor', 'tax_inspection', 'other'];
const AUTHORITY_LABELS = {
  rospotrebnadzor: 'Роспотребнадзор',
  fire_inspection: 'Пожарный надзор (МЧС)',
  labor_inspection: 'Инспекция труда',
  roskomnadzor: 'Роскомнадзор',
  tax_inspection: 'Налоговая (ФНС)',
  other: 'Другой орган',
};
const KINDS = ['planned', 'unplanned', 'unknown'];
// Фиксированный список, не свободный текст — чтобы области можно было
// сравнивать между компаниями, когда (и если) появится согласованная
// обезличенная аналитика.
const INSPECTION_AREAS = ['sanitary', 'fire', 'personal_data', 'labor', 'tax_cash', 'consumer_rights', 'licenses_waste', 'other'];
const OUTCOMES = ['no_findings', 'remarks_fixed', 'order', 'protocol', 'suspension'];

const ORDER_DEADLINE_TYPE = 'inspection_order';

function isValidDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function toRow(r) {
  return {
    id: r.id,
    inspectedOn: r.inspected_on,
    authority: r.authority,
    authorityLabel: AUTHORITY_LABELS[r.authority] || r.authority,
    kind: r.kind,
    areas: r.areas,
    outcome: r.outcome,
    fineAmount: r.fine_amount === null ? null : Number(r.fine_amount),
    fixDueDate: r.fix_due_date,
    details: r.details_enc ? decrypt(r.details_enc) : '',
    createdAt: r.created_at,
  };
}

// Общая проверка тела запроса для POST и PATCH — возвращает { error } или
// { value } с уже нормализованными полями. partial=true (PATCH) не требует
// обязательных полей, только проверяет те, что реально пришли.
function validateBody(body, { partial }) {
  const out = {};

  if (body.inspectedOn !== undefined || !partial) {
    if (!isValidDate(body.inspectedOn)) return { error: 'Укажите дату проверки' };
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (new Date(`${body.inspectedOn}T00:00:00Z`) > tomorrow) return { error: 'Дата проверки не может быть в будущем' };
    out.inspectedOn = body.inspectedOn;
  }
  if (body.authority !== undefined || !partial) {
    if (!AUTHORITIES.includes(body.authority)) return { error: 'Выберите орган, который проводил проверку' };
    out.authority = body.authority;
  }
  if (body.kind !== undefined) {
    if (!KINDS.includes(body.kind)) return { error: 'Некорректный вид проверки' };
    out.kind = body.kind;
  }
  if (body.areas !== undefined) {
    if (!Array.isArray(body.areas) || body.areas.some((a) => !INSPECTION_AREAS.includes(a))) return { error: 'Некорректный список областей проверки' };
    out.areas = [...new Set(body.areas)];
  }
  if (body.outcome !== undefined || !partial) {
    if (!OUTCOMES.includes(body.outcome)) return { error: 'Выберите итог проверки' };
    out.outcome = body.outcome;
  }
  if (body.fineAmount !== undefined) {
    if (body.fineAmount === null || body.fineAmount === '') {
      out.fineAmount = null;
    } else {
      const n = Number(body.fineAmount);
      if (!Number.isFinite(n) || n < 0 || n > 1e9) return { error: 'Некорректная сумма штрафа' };
      out.fineAmount = n;
    }
  }
  if (body.fixDueDate !== undefined) {
    if (body.fixDueDate === null || body.fixDueDate === '') {
      out.fixDueDate = null;
    } else if (!isValidDate(body.fixDueDate)) {
      return { error: 'Некорректный срок исправления' };
    } else {
      out.fixDueDate = body.fixDueDate;
    }
  }
  if (body.details !== undefined) {
    if (typeof body.details !== 'string' || body.details.length > 4000) return { error: 'Заметка слишком длинная (до 4000 символов)' };
    out.details = body.details.trim();
  }
  return { value: out };
}

// Срок исправления по предписанию — обычный дедлайн компании (категория
// 'documents', как и остальные пункты про документы/проверки): попадает в
// "Дедлайны"/Центр действий и получает напоминания на общих основаниях,
// вместо того чтобы жить только в этой вкладке. Один дедлайн на проверку
// (related_entity_id = inspections.id) — повторный вызов обновляет, не
// дублирует. Снимаем, если итог перестал быть "предписание" или срока нет.
async function syncOrderDeadline(companyId, row) {
  if (row.outcome === 'order' && row.fix_due_date) {
    await registerDeadline({
      companyId,
      category: 'documents',
      title: `Срок по предписанию — ${AUTHORITY_LABELS[row.authority] || 'проверка'}`,
      dueDate: row.fix_due_date,
      relatedEntityType: ORDER_DEADLINE_TYPE,
      relatedEntityId: row.id,
    });
  } else {
    await clearAction({ relatedEntityType: ORDER_DEADLINE_TYPE, relatedEntityId: row.id, category: 'documents' });
  }
}

const NOTICE_DAILY_LIMIT = 10;
const MAX_NOTICE_CHARS = 12000;

// Связки экосистемы (детерминированные, без ИИ): нормы, которые названы в
// бумаге и уже есть в реестре продукта (core/citedLawReferences.js) —
// показываем нарушения из теста и шаблоны документов ЭТОЙ компании, которые
// на них опираются. Другие нормы (КоАП, СанПиН, приказы) в реестре пока не
// индексируются — с тестом честно не связываются.
async function buildEcosystemLinks(companyId, text) {
  const cited = new Map();
  for (const c of extractCitations(text)) {
    if (c.type === 'fz' || c.type === 'pp') cited.set(`${c.type}:${c.number}`, c);
  }
  if (cited.size === 0) return { citedNorms: [], relatedViolations: [], relatedTemplates: [] };

  const index = await buildCitationIndex();
  const nicheRows = await pool.query('SELECT niche FROM security_profile_niches WHERE company_id = $1', [companyId]);
  const niches = new Set(nicheRows.rows.map((r) => r.niche));

  const inRegistry = new Set(index.map((e) => `${e.type}:${e.number}`));
  const citedNorms = [...cited.values()].map((c) => ({
    label: c.type === 'fz' ? `${c.number}-ФЗ` : `ПП РФ №${c.number}`,
    inRegistry: inRegistry.has(`${c.type}:${c.number}`),
  }));

  const violationMap = new Map();
  const templateMap = new Map();
  for (const e of index) {
    if (!cited.has(`${e.type}:${e.number}`) || !niches.has(e.niche)) continue;
    if (e.violationCode && !violationMap.has(e.violationCode)) violationMap.set(e.violationCode, e.violationTitle);
    if (e.templateKey && !templateMap.has(e.templateKey)) templateMap.set(e.templateKey, e.templateTitle);
  }

  let statuses = {};
  if (violationMap.size > 0) {
    const { rows } = await pool.query(
      'SELECT violation_code, status FROM security_violations WHERE company_id = $1 AND violation_code = ANY($2)',
      [companyId, [...violationMap.keys()]]
    );
    statuses = Object.fromEntries(rows.map((r) => [r.violation_code, r.status]));
  }
  const rank = { open: 0, resolved: 2 };
  const relatedViolations = [...violationMap.entries()]
    .map(([code, title]) => ({ code, title, status: statuses[code] || null }))
    .sort((a, b) => (rank[a.status] ?? 1) - (rank[b.status] ?? 1))
    .slice(0, 8);
  const relatedTemplates = [...templateMap.entries()].map(([key, title]) => ({ key, title })).slice(0, 6);
  return { citedNorms, relatedViolations, relatedTemplates };
}

// Разбор бумаги от проверяющего (20.09.2026, идея владельца — часть
// экосистемы, не отдельный продукт): загрузил предписание/акт/протокол —
// получил разбор простыми словами, подсказки для записи в "Историю
// проверок" (орган, даты, сумма, области, итог) и связки с тем, что уже есть
// у компании. Файл нигде не сохраняется. Дата/срок/сумма — детерминированный
// код (analyze.js), ИИ (YandexGPT, российский контур) только формулирует
// summary и только для тех, у кого доступ к ИИ (подписка, как и весь ИИ);
// без подписки — тот же разбор без ИИ-текста. Гостевые компании не
// допускаются (OCR и ИИ стоят денег, а гостевой старт без почты и капчи —
// известная дыра, см. разбор защиты от копирования 20.09.2026).
router.post(
  '/inspections/analyze-notice',
  (req, res, next) => uploadInspectionNotice(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Не удалось принять файл' });
    next();
  }),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не передан' });

    const { rows: userRows } = await pool.query('SELECT is_guest FROM users WHERE id = $1', [req.user.id]);
    if (userRows[0]?.is_guest) {
      return res.status(403).json({ error: 'Сохраните результаты теста (задайте пароль), и разбор бумаги станет доступен' });
    }
    if (await isOverDailyEventLimit(req.tenant.companyId, 'inspection_notice', 'inspection_notice.analyzed', NOTICE_DAILY_LIMIT)) {
      return res.status(429).json({ error: 'На сегодня лимит разборов исчерпан — продолжите завтра' });
    }

    let text = '';
    try {
      if (req.file.mimetype.startsWith('image/')) {
        if (!isOcrConfigured()) return res.status(503).json({ error: 'Распознавание фото пока не настроено — загрузите PDF или DOCX' });
        text = await ocrExtractText(req.file.buffer, req.file.mimetype);
      } else {
        text = await extractText(req.file.buffer, req.file.mimetype);
      }
    } catch (err) {
      console.error('analyze-notice: text extraction failed', err.message);
      return res.status(422).json({ error: 'Не удалось прочитать файл. Попробуйте другой файл или внесите проверку вручную' });
    }
    text = (text || '').replace(/\s+\n/g, '\n').trim();
    if (text.length < 80) {
      return res.status(422).json({
        error: 'В файле почти нет читаемого текста. Для скана или фото приложите изображение хорошего качества (JPG/PNG) либо внесите проверку вручную',
      });
    }
    if (text.length > MAX_NOTICE_CHARS) text = text.slice(0, MAX_NOTICE_CHARS);

    const hints = analyze.extractHints(text, moscowDateStr());

    const { rows: companyRows } = await pool.query('SELECT free_addons FROM companies WHERE id = $1', [req.tenant.companyId]);
    const hasAiAccess = !!companyRows[0]?.free_addons || (await isSubscriptionActive(req.tenant.companyId));
    let aiRaw = null;
    if (hasAiAccess && yandexAssist.isAiConfigured()) {
      try {
        aiRaw = await yandexAssist.draftText({
          system: analyze.AI_SYSTEM_PROMPT,
          prompt: analyze.buildAiPrompt(text, hints),
          maxTokens: 900,
          temperature: 0.1,
        });
      } catch (err) {
        console.error('analyze-notice: ai failed', err.message);
      }
    }

    const analysis = analyze.mergeAnalysis(hints, aiRaw);
    const suggestion = {
      inspectedOn: analysis.inspectedOn,
      authority: analysis.authority,
      areas: analysis.areas,
      outcome: analyze.suggestOutcome(analysis),
      fixDueDate: analysis.deadlineDate,
      fineAmount: analysis.fineAmount,
    };
    const links = await buildEcosystemLinks(req.tenant.companyId, text);
    // Нужен, чтобы "нарушения в вашем тесте нет" не говорилось человеку, который
    // тест ещё не проходил (там status тоже null).
    const testDone = await pool.query("SELECT 1 FROM security_sessions WHERE company_id = $1 AND status = 'completed' LIMIT 1", [req.tenant.companyId]);

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'security',
      userId: req.user.id,
      entityType: 'inspection_notice',
      action: 'inspection_notice.analyzed',
      payload: { aiUsed: analysis.aiUsed, chars: text.length },
    });

    res.json({
      analysis: { summary: analysis.summary, findings: analysis.findings, kind: analysis.kind, koapArticles: analysis.koapArticles, aiUsed: analysis.aiUsed },
      aiAvailable: hasAiAccess,
      suggestion,
      testCompleted: testDone.rows.length > 0,
      ...links,
    });
  })
);

router.get(
  '/inspections',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, to_char(inspected_on, 'YYYY-MM-DD') AS inspected_on, authority, kind, areas, outcome, fine_amount,
              to_char(fix_due_date, 'YYYY-MM-DD') AS fix_due_date, details_enc, created_at
       FROM inspections WHERE company_id = $1 ORDER BY inspected_on DESC, id DESC`,
      [req.tenant.companyId]
    );
    res.json(rows.map(toRow));
  })
);

router.post(
  '/inspections',
  asyncHandler(async (req, res) => {
    const { error, value } = validateBody(req.body || {}, { partial: false });
    if (error) return res.status(400).json({ error });
    if (value.fixDueDate && value.fixDueDate < value.inspectedOn) {
      return res.status(400).json({ error: 'Срок исправления не может быть раньше даты проверки' });
    }

    const { rows } = await pool.query(
      `INSERT INTO inspections (company_id, inspected_on, authority, kind, areas, outcome, fine_amount, fix_due_date, details_enc, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, to_char(inspected_on, 'YYYY-MM-DD') AS inspected_on, authority, kind, areas, outcome, fine_amount,
                 to_char(fix_due_date, 'YYYY-MM-DD') AS fix_due_date, details_enc, created_at`,
      [
        req.tenant.companyId, value.inspectedOn, value.authority, value.kind || 'unknown', value.areas || [], value.outcome,
        value.fineAmount ?? null, value.fixDueDate || null, value.details ? encrypt(value.details) : null, req.user.id,
      ]
    );
    await syncOrderDeadline(req.tenant.companyId, rows[0]);
    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'security',
      userId: req.user.id,
      entityType: 'inspection',
      entityId: rows[0].id,
      action: 'inspection.created',
    });
    res.status(201).json(toRow(rows[0]));
  })
);

router.patch(
  '/inspections/:id',
  asyncHandler(async (req, res) => {
    const { error, value } = validateBody(req.body || {}, { partial: true });
    if (error) return res.status(400).json({ error });

    const currentRes = await pool.query(
      `SELECT id, to_char(inspected_on, 'YYYY-MM-DD') AS inspected_on, to_char(fix_due_date, 'YYYY-MM-DD') AS fix_due_date
       FROM inspections WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.tenant.companyId]
    );
    if (currentRes.rows.length === 0) return res.status(404).json({ error: 'Проверка не найдена' });
    const current = currentRes.rows[0];

    const effectiveInspectedOn = value.inspectedOn || current.inspected_on;
    const effectiveFixDue = 'fixDueDate' in value ? value.fixDueDate : current.fix_due_date;
    if (effectiveFixDue && effectiveFixDue < effectiveInspectedOn) {
      return res.status(400).json({ error: 'Срок исправления не может быть раньше даты проверки' });
    }

    // Поле обновляется, только если реально пришло (null тоже валидное
    // значение — очистить сумму/срок/заметку), тот же приём, что в
    // supplies.routes.js PATCH.
    const has = (k) => k in value;
    const { rows } = await pool.query(
      `UPDATE inspections SET
         inspected_on = CASE WHEN $3 THEN $4 ELSE inspected_on END,
         authority = CASE WHEN $5 THEN $6 ELSE authority END,
         kind = CASE WHEN $7 THEN $8 ELSE kind END,
         areas = CASE WHEN $9 THEN $10 ELSE areas END,
         outcome = CASE WHEN $11 THEN $12 ELSE outcome END,
         fine_amount = CASE WHEN $13 THEN $14 ELSE fine_amount END,
         fix_due_date = CASE WHEN $15 THEN $16 ELSE fix_due_date END,
         details_enc = CASE WHEN $17 THEN $18 ELSE details_enc END,
         updated_at = now()
       WHERE id = $1 AND company_id = $2
       RETURNING id, to_char(inspected_on, 'YYYY-MM-DD') AS inspected_on, authority, kind, areas, outcome, fine_amount,
                 to_char(fix_due_date, 'YYYY-MM-DD') AS fix_due_date, details_enc, created_at`,
      [
        req.params.id, req.tenant.companyId,
        has('inspectedOn'), value.inspectedOn ?? null,
        has('authority'), value.authority ?? null,
        has('kind'), value.kind ?? null,
        has('areas'), value.areas ?? null,
        has('outcome'), value.outcome ?? null,
        has('fineAmount'), value.fineAmount ?? null,
        has('fixDueDate'), value.fixDueDate ?? null,
        has('details'), value.details ? encrypt(value.details) : null,
      ]
    );
    await syncOrderDeadline(req.tenant.companyId, rows[0]);
    res.json(toRow(rows[0]));
  })
);

router.delete(
  '/inspections/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM inspections WHERE id = $1 AND company_id = $2', [req.params.id, req.tenant.companyId]);
    if (rowCount === 0) return res.status(404).json({ error: 'Проверка не найдена' });
    await clearAction({ relatedEntityType: ORDER_DEADLINE_TYPE, relatedEntityId: Number(req.params.id), category: 'documents' });
    res.status(204).end();
  })
);

module.exports = router;
module.exports.AUTHORITY_LABELS = AUTHORITY_LABELS;
