const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { sendPushToSuperAdmins } = require('../core/pushNotify');
const { requireAiAdvisorSubscription } = require('../core/middleware/subscription');
const { recommendTaxRegime } = require('../core/taxRegimeRecommender');
const yandexAssist = require('../core/yandexAssist');

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
