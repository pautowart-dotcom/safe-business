const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { sendPushToSuperAdmins } = require('../core/pushNotify');
const { requireAiAdvisorSubscription } = require('../core/middleware/subscription');
const { recommendTaxRegime } = require('../core/taxRegimeRecommender');
const yandexAssist = require('../core/yandexAssist');
const securityRepository = require('../modules/security/content/repository');
const { logEvent } = require('../core/eventLog');
const { AUTHORITY_LABELS } = require('../modules/security/inspections.routes');
const { isOverDailyAiLimit } = require('../core/aiUsageLimit');

// Единая подписка (06.09.2026) — /checkout, /cancel, /reactivate ИИ-советника
// как отдельного продукта УДАЛЕНЫ (см. git-историю): теперь это часть одной
// подписки, оформление/включение/выключение — только через
// subscription.routes.js (/checkout с includeAi, /toggle-ai). Этот файл
// оставлен для контента, доступного по надбавке (расшифровки закона,
// налоговый агент) — requireAiAdvisorSubscription теперь проверяет флаг
// внутри единой подписки, а не отдельный биллинг-цикл. handleAiAdvisorSub
// scriptionWebhook внизу файла оставлен ради платежей, созданных ДО этой
// правки (архив), новых через него больше не проводится.

const router = express.Router();

// Расшифровки закона, уже опубликованные владельцем платформы (05.09.2026,
// новая когорта) — общие для всех подписчиков этого тарифа (v1 без
// таргетинга по нише/налоговому режиму, см. план "ИИ по законодательству"),
// поэтому без company_id в запросе.
router.get(
  '/law-notices',
  requireAuth,
  requireTenant,
  requireAiAdvisorSubscription,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, explanation, published_at AS "publishedAt" FROM law_change_notices ORDER BY published_at DESC LIMIT 30`
    );
    res.json(rows);
  })
);

// ИИ-агент по налогам (06.09.2026) — для новой когорты, той же подпиской,
// что "ИИ по законодательству": не отдельный тариф. Расчёт — тот же
// детерминированный core/taxRegimeRecommender.js, что уже используется в
// my-deadlines.routes.js для СТАРОЙ когорты (там источник цифр —
// finance_entries/expense_entries). У новой когорты этих таблиц нет, значит
// эндпоинт принимает revenue/expenses явно от фронтенда (разговорный визард
// сам их спрашивает) — ИИ здесь НЕ считает налоги сам, только помогает
// собрать недостающие ответы на фронте и объясняет уже готовый результат
// текстом (тот же принцип "цифры точные, не пересчитывай", что в
// ai-advisor-digest.routes.js). region_code/has_employees/niche берём из
// уже сохранённого профиля компании, если фронт их не передал явно — чтобы
// не переспрашивать то, что уже известно.
async function buildTaxAgentSummary(result) {
  const lines = result.options
    .filter((o) => o.estimatedTaxRub != null)
    .map((o) => `${o.label}: ${o.estimatedTaxRub} ₽` + (o.note ? ` (${o.note})` : ''));
  if (lines.length === 0) return null;

  const system =
    'Ты — ИИ-агент по налогам продукта "Безопасный бизнес" для владельцев малого бизнеса. Тебе дают уже посчитанные ' +
    'варианты налогообложения с точными суммами — числа точные, не пересчитывай их и не придумывай новые, не выдумывай ' +
    'ставки или нормы закона, которых нет в переданных данных. Задача: 3-5 предложений простым языком — какой вариант ' +
    'дешевле и почему, на что обратить внимание (например, если патент не проверен юристом — упомяни это честно). Если ' +
    'передано предупреждение про НДС — обязательно упомяни его своими словами, не пропускай молча. Не ' +
    'обещай гарантированный результат и не давай юридических гарантий, тон честный и простой, без канцелярита.';
  const vatLine = result.vatWarning ? `\n\nПредупреждение про НДС: ${result.vatWarning}` : '';
  const prompt = `Выручка с начала года: ${result.revenue} ₽\nРасходы с начала года: ${result.expenses} ₽\n\nВарианты:\n${lines.join('\n')}${vatLine}`;

  return yandexAssist.draftText({ system, prompt, maxTokens: 500 });
}

router.post(
  '/tax-agent',
  requireAuth,
  requireTenant,
  requireAiAdvisorSubscription,
  asyncHandler(async (req, res) => {
    const revenue = Number(req.body.revenue);
    const expenses = Number(req.body.expenses);
    if (!Number.isFinite(revenue) || revenue < 0 || !Number.isFinite(expenses) || expenses < 0) {
      return res.status(400).json({ error: 'Укажите выручку и расходы неотрицательными числами' });
    }

    const companyId = req.tenant.companyId;
    const [{ rows: companyRows }, { rows: nicheRows }] = await Promise.all([
      pool.query('SELECT region_code, has_employees FROM companies WHERE id = $1', [companyId]),
      pool.query('SELECT niche FROM security_profile_niches WHERE company_id = $1', [companyId]),
    ]);
    const company = companyRows[0] || {};

    const regionCode = req.body.regionCode || company.region_code || null;
    const hasEmployees = typeof req.body.hasEmployees === 'boolean' ? req.body.hasEmployees : !!company.has_employees;
    const niche = req.body.niche || (nicheRows.length === 1 ? nicheRows[0].niche : null);
    // expensesDocumented (07.09.2026) — обязательный ответ визарда на фронте
    // (TaxAgentCard), не профильное поле компании, поэтому без фолбэка на
    // company.*: undefined здесь означает "фронт не спросил" (старые версии
    // фронта, до раскатки) — taxRegimeRecommender.js трактует undefined как
    // "не предупреждаем", тот же эффект, что и раньше этой правки.
    const expensesDocumented = typeof req.body.expensesDocumented === 'boolean' ? req.body.expensesDocumented : undefined;

    const result = await recommendTaxRegime({
      companyId,
      regionCode,
      niche,
      hasEmployees,
      manualFinance: { revenue, expenses },
      expensesDocumented,
    });

    const response = { ...result, regionCode, hasEmployees, niche, aiConfigured: yandexAssist.isAiConfigured(), aiSummary: null };
    if (response.aiConfigured) {
      try {
        response.aiSummary = await buildTaxAgentSummary(result);
      } catch (err) {
        response.aiSummaryError = 'Не удалось получить текстовое объяснение от ИИ';
      }
    }

    res.json(response);
  })
);

// "ИИ, который знает ваш бизнес" (18.09.2026, решение владельца — дорогой
// вариант из двух обсуждённых: не точечно усиливать 3 узкие функции, а
// сделать настоящий чат). До этой правки ни одна из трёх функций ИИ-советника
// вообще не видела нарушения/сроки компании (проверено при разборе — только
// нишу видел tax-agent, и то не всегда). Здесь — тот же принцип, что уже
// работает в tax-agent (buildTaxAgentSummary выше) и в document-risk-check:
// ИИ ничего не считает и не проверяет сам, только объясняет словами уже
// существующие, проверенные факты (violationMatrix, deadlines) — те же
// данные, что показаны в интерфейсе на вкладках "Нарушения"/"Дедлайны", не
// новый источник правды. Разговорной памяти (истории сообщений) пока нет —
// каждый вопрос собирает контекст заново с нуля, простой первый шаг, не
// продакшн-чат с состоянием.
async function buildBusinessContext(companyId) {
  const [{ rows: nicheRows }, { rows: violationRows }, { rows: deadlineRows }, { rows: companyRows }, { rows: inspectionRows }] = await Promise.all([
    pool.query('SELECT niche FROM security_profile_niches WHERE company_id = $1', [companyId]),
    pool.query(`SELECT violation_code, niche FROM security_violations WHERE company_id = $1 AND status = 'open'`, [companyId]),
    pool.query(
      `SELECT title, to_char(due_date, 'YYYY-MM-DD') AS due_date FROM deadlines
       WHERE company_id = $1 AND kind = 'deadline' AND status = 'pending' ORDER BY due_date ASC LIMIT 15`,
      [companyId]
    ),
    pool.query('SELECT region_code, has_employees FROM companies WHERE id = $1', [companyId]),
    // История проверок (19.09.2026) — только структурные поля, заметку
    // владельца (details_enc, свободный текст) в ИИ не передаём: там могут
    // быть имена и подробности, которые модели знать незачем.
    pool.query(
      `SELECT to_char(inspected_on, 'YYYY-MM-DD') AS inspected_on, authority, outcome, areas, fine_amount
       FROM inspections WHERE company_id = $1 ORDER BY inspected_on DESC LIMIT 5`,
      [companyId]
    ),
  ]);

  const violationDetails = [];
  for (const v of violationRows) {
    const details = await securityRepository.getViolation(v.niche, v.violation_code);
    if (details) {
      violationDetails.push({ title: details.title, fineText: details.fineText, normBase: details.normBase, solution: details.solution });
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const deadlines = deadlineRows.map((d) => ({ title: d.title, dueDate: d.due_date, overdue: d.due_date < todayStr }));

  const inspections = inspectionRows.map((r) => ({
    date: r.inspected_on,
    authority: AUTHORITY_LABELS[r.authority] || r.authority,
    outcome: INSPECTION_OUTCOME_LABELS[r.outcome] || r.outcome,
    areas: (r.areas || []).map((a) => INSPECTION_AREA_LABELS[a] || a),
    fine: r.fine_amount === null ? null : Number(r.fine_amount),
  }));

  return { niches: nicheRows.map((r) => r.niche), company: companyRows[0] || {}, violationDetails, deadlines, inspections };
}

const INSPECTION_OUTCOME_LABELS = {
  no_findings: 'замечаний нет',
  remarks_fixed: 'замечания устранены на месте',
  order: 'выдано предписание',
  protocol: 'составлен протокол / штраф',
  suspension: 'приостановка деятельности',
};
const INSPECTION_AREA_LABELS = {
  sanitary: 'санитария',
  fire: 'пожарная безопасность',
  personal_data: 'персональные данные',
  labor: 'трудовые отношения',
  tax_cash: 'налоги и кассы',
  consumer_rights: 'защита прав потребителей',
  licenses_waste: 'лицензии и отходы',
  other: 'другое',
};

function formatContextForPrompt(ctx) {
  const lines = [];
  lines.push(`Ниша(и) бизнеса: ${ctx.niches.join(', ') || 'не указано в профиле'}`);
  if (ctx.company.region_code) lines.push(`Регион: ${ctx.company.region_code}`);
  if (typeof ctx.company.has_employees === 'boolean') lines.push(`Наёмные сотрудники: ${ctx.company.has_employees ? 'есть' : 'нет'}`);

  if (ctx.violationDetails.length === 0) {
    lines.push('Открытых нарушений по тесту безопасности сейчас нет (или тест ещё не пройден).');
  } else {
    lines.push(`Открытые нарушения из теста безопасности (${ctx.violationDetails.length}):`);
    for (const v of ctx.violationDetails) {
      lines.push(`- ${v.title}. Штраф: ${v.fineText || 'не определён'}. Норма: ${v.normBase || 'не указана'}. Как решить: ${v.solution || 'не указано'}.`);
    }
  }

  if (ctx.inspections.length > 0) {
    lines.push('Прошлые проверки (внесены владельцем):');
    for (const i of ctx.inspections) {
      const parts = [`${i.date} — ${i.authority}`, `итог: ${i.outcome}`];
      if (i.areas.length > 0) parts.push(`проверяли: ${i.areas.join(', ')}`);
      if (i.fine) parts.push(`штраф ${i.fine} ₽`);
      lines.push(`- ${parts.join('; ')}`);
    }
  }

  if (ctx.deadlines.length === 0) {
    lines.push('Ближайших сроков в разделе "Мои сроки"/"Дедлайны" не внесено.');
  } else {
    lines.push('Ближайшие сроки:');
    for (const d of ctx.deadlines) {
      lines.push(`- ${d.title}: ${d.dueDate}${d.overdue ? ' (просрочено)' : ''}`);
    }
  }
  return lines.join('\n');
}

// Проактивная сводка (18.09.2026) — та же идея, что уже работает у
// финансовой когорты (modules/finance/ai-advisor-digest.routes.js): не
// ждать, пока владелец сам сформулирует вопрос чату, а сразу показать
// главное сверху экрана. Переиспользует buildBusinessContext/
// formatContextForPrompt — тот же контекст, что видит /ask, просто другой
// промпт (не "ответь на вопрос", а "сведи в один брифинг"). "Notable" — то
// же по духу решение, что hasNotableMargin и т.п. у финансовой сводки: нет
// смысла звать ИИ и показывать карточку, если сказать нечего (нет
// нарушений и нет сроков ближе 30 дней) — 30 дней такое же инженерное
// решение "разумный горизонт", как и пороги там, можно пересмотреть.
function hasNotableComplianceFindings(ctx) {
  if (ctx.violationDetails.length > 0) return true;
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 30);
  const horizonStr = horizon.toISOString().slice(0, 10);
  return ctx.deadlines.some((d) => d.overdue || d.dueDate <= horizonStr);
}

const DIGEST_SYSTEM_PROMPT =
  'Ты — ИИ-помощник продукта "Безопасный бизнес" для владельцев малого бизнеса без штатного юриста и бухгалтера. Тебе даны ' +
  'факты о конкретном бизнесе клиента (открытые нарушения из теста безопасности со штрафами и нормами, ближайшие сроки) — ' +
  'используй ТОЛЬКО эти факты, не выдумывай других. Задача: короткий брифинг (3-5 предложений) — что из переданного самое ' +
  'срочное и что стоит сделать в первую очередь. Не перечисляй всё подряд, выдели главное. Не обещай гарантированный ' +
  'результат и не пугай проверками, тон честный и простой. Если и нарушений, и близких сроков нет — не должен был вызываться ' +
  'вовсе, но если так вышло, коротко скажи, что срочного сейчас нет.';

async function buildComplianceDigest(ctx) {
  return yandexAssist.draftText({ system: DIGEST_SYSTEM_PROMPT, prompt: formatContextForPrompt(ctx), maxTokens: 400 });
}

router.get(
  '/digest',
  requireAuth,
  requireTenant,
  requireAiAdvisorSubscription,
  asyncHandler(async (req, res) => {
    const ctx = await buildBusinessContext(req.tenant.companyId);
    const hasNotableFindings = hasNotableComplianceFindings(ctx);
    const response = { hasNotableFindings, aiConfigured: yandexAssist.isAiConfigured(), digest: null };

    if (hasNotableFindings && response.aiConfigured) {
      try {
        response.digest = await buildComplianceDigest(ctx);
      } catch (err) {
        console.error('ai-advisor-subscription /digest: draftText failed', err);
        response.digestError = 'Не удалось получить текстовую сводку от ИИ';
      }
    }

    res.json(response);
  })
);

const CHAT_SYSTEM_PROMPT =
  'Ты — ИИ-помощник продукта "Безопасный бизнес" для владельцев малого бизнеса без штатного юриста и бухгалтера. Тебе даны ' +
  'факты о конкретном бизнесе клиента (ниша, открытые нарушения из его теста безопасности со штрафами и нормами, ближайшие ' +
  'сроки) — используй ТОЛЬКО эти факты и вопрос владельца, не выдумывай других фактов о его бизнесе, которых тебе не давали. ' +
  'Можно объяснять общие нормы закона по теме вопроса, но если не уверен в конкретной статье или сумме — так и скажи, не ' +
  'выдумывай. Никогда не давай юридических гарантий и не обещай, что штрафа или проверки не будет. Тон честный и простой, без ' +
  'канцелярита и без запугивания. Если вопрос не связан с фактами о бизнесе клиента или требует реальной юридической/' +
  'бухгалтерской оценки конкретной ситуации — прямо скажи об этом и посоветуй обратиться к юристу/бухгалтеру, не изображай ' +
  'уверенность, которой нет. Отвечай кратко и по делу — 3-6 предложений, если вопрос явно не требует большего.';

router.post(
  '/ask',
  requireAuth,
  requireTenant,
  requireAiAdvisorSubscription,
  asyncHandler(async (req, res) => {
    const question = typeof req.body.question === 'string' ? req.body.question.trim() : '';
    if (!question) return res.status(400).json({ error: 'Введите вопрос' });
    // Защита от неконтролируемой стоимости на один запрос — тот же приём,
    // что и обрезка текста в document-risk-check (там 15000 символов на
    // ЗАГРУЖЕННЫЙ документ; здесь ввод набирает сам владелец, разумный
    // потолок намного меньше).
    if (question.length > 1500) return res.status(400).json({ error: 'Слишком длинный вопрос — сократите до 1500 символов' });
    if (!yandexAssist.isAiConfigured()) return res.status(503).json({ error: 'ИИ пока не настроен — попробуйте позже' });

    if (await isOverDailyAiLimit(req.tenant.companyId)) {
      return res.status(429).json({ error: 'На сегодня лимит вопросов к ИИ исчерпан — продолжите завтра' });
    }

    const ctx = await buildBusinessContext(req.tenant.companyId);
    const prompt = `${formatContextForPrompt(ctx)}\n\nВопрос владельца бизнеса: ${question}`;

    let answer;
    try {
      answer = await yandexAssist.draftText({ system: CHAT_SYSTEM_PROMPT, prompt, maxTokens: 700 });
    } catch (err) {
      console.error('ai-advisor-subscription /ask: draftText failed', err);
      return res.status(502).json({ error: 'Не удалось получить ответ от ИИ — попробуйте ещё раз' });
    }

    // Только факт обращения, не текст вопроса/ответа (могут содержать
    // чувствительные детали бизнеса) — та же причина, по которой
    // document_risk_checks.extracted_text_enc/risk_analysis_enc шифруются, а
    // не просто не логируются: здесь решили не хранить содержимое вовсе,
    // раз ответ и так не персистится. Цель — не потерять из виду usage, как
    // это уже случилось с "Мои сроки" (0/142 заполнений и никто не заметил,
    // пока не проверили вручную).
    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'ai_advisor',
      userId: req.user.id,
      entityType: 'ai_advisor_chat',
      action: 'ai_advisor_chat.asked',
    });

    res.json({ answer });
  })
);

// Вебхук ЮKassa на эти платежи обрабатывается ВНУТРИ существующего
// POST /platform/subscription/webhook (см. комментарий там и в
// addons.routes.js) — один URL в личном кабинете ЮKassa на все продукты,
// не просим владельца прописывать второй.
//
// payment — уже перепроверенный через getPayment() объект от ЮKassa,
// вызывающий код (subscription.routes.js) не доверяет телу исходного
// запроса повторно.
async function handleAiAdvisorSubscriptionWebhook(paymentId, payment, res) {
  const { rows } = await pool.query(
    `SELECT sp.company_id, sp.amount_rub, sp.is_recurring_charge, c.name AS company_name
     FROM ai_advisor_subscription_payments sp JOIN companies c ON c.id = sp.company_id
     WHERE sp.yookassa_payment_id = $1`,
    [paymentId]
  );
  if (rows.length === 0) return null; // не наш платёж — пусть проверят дальше по цепочке

  const { company_id: companyId, amount_rub: amountRub, is_recurring_charge: isRecurringCharge, company_name: companyName } = rows[0];

  if (payment.status === 'succeeded') {
    const nextPeriodEnd = new Date();
    nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);

    await pool.query(
      `UPDATE ai_advisor_subscription_payments SET status = 'succeeded', confirmed_at = now() WHERE yookassa_payment_id = $1`,
      [paymentId]
    );

    if (payment.payment_method?.saved && payment.payment_method?.id) {
      await pool.query(
        `UPDATE companies SET ai_advisor_subscription_status = 'active', ai_advisor_subscription_current_period_end = $2,
                               ai_advisor_yookassa_payment_method_id = $3
         WHERE id = $1`,
        [companyId, nextPeriodEnd, payment.payment_method.id]
      );
    } else {
      await pool.query(
        `UPDATE companies SET ai_advisor_subscription_status = 'active', ai_advisor_subscription_current_period_end = $2 WHERE id = $1`,
        [companyId, nextPeriodEnd]
      );
    }

    sendPushToSuperAdmins({
      title: isRecurringCharge ? 'Автосписание ИИ-подписки прошло' : 'Новая оплата ИИ-подписки',
      body: `${companyName} — ${amountRub} ₽`,
      url: '/office/companies',
    }).catch((err) => console.error('sendPushToSuperAdmins (ai advisor payment) failed:', err));
  } else if (payment.status === 'canceled') {
    await pool.query(`UPDATE ai_advisor_subscription_payments SET status = 'canceled' WHERE yookassa_payment_id = $1`, [paymentId]);
  }

  res.status(200).end();
  return true;
}

module.exports = router;
module.exports.handleAiAdvisorSubscriptionWebhook = handleAiAdvisorSubscriptionWebhook;
// Переиспользуются в scripts/complianceDigestNudges.js (18.09.2026) — тот же
// контекст и то же "стоит ли вообще звать ИИ", что и в GET /digest выше, не
// дублируем логику ради крона.
module.exports.buildBusinessContext = buildBusinessContext;
module.exports.hasNotableComplianceFindings = hasNotableComplianceFindings;
