const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { createPayment } = require('../core/yookassa');
const { sendPushToSuperAdmins } = require('../core/pushNotify');
const { requireAiAdvisorSubscription } = require('../core/middleware/subscription');

// Цена определена 19.08.2026 (владелец делегировал решение) — единственное
// место с этой цифрой изначально, тот же принцип, что SUBSCRIPTION_PRICE_RUB
// в subscription.routes.js и core/addons.js. Обоснование (не хардкодить
// повторно нигде): три узких read-only советника (маржа/скидки/уход
// мастера) — это дополнительная ценность поверх базовой подписки, а не
// замена ей, и продукт ещё не проверен реальными платящими пользователями
// (см. docs/status-2026-08-19-handoff.md) — поэтому цена ниже базовой
// (1990 ₽), а не равна ей, и заметно ниже цены будущего полного
// ИИ-ассистента с function calling (владелец ранее называл ориентир
// 3990 ₽+ для него самого) — советник дешевле ассистента, потому что
// только читает данные, ничего не делает за владельца.
//
// 05.09.2026: цена теперь по компании — companies.ai_advisor_subscription_
// price_rub (миграция 0090, DEFAULT 990; auth.routes.js явно ставит 490 для
// новой когорты при регистрации, см. core/cohort.js) — тот же столбец, из
// которого уже читает chargeRecurringSubscriptions.js для автосписаний.
// Раньше этот роут игнорировал столбец и слал захардкоженную константу —
// расхождение нашлось только сейчас: если бы когорта не потребовала разных
// цен, оно бы и дальше молчало (первое списание всегда совпадало с DEFAULT).

const router = express.Router();

// Оформление подписки на ИИ-управляющего — независимо от статуса базовой
// подписки платформы (владелец явно подтвердил 19.08.2026): компания может
// быть ещё в пробном периоде базовой и уже оплатить ИИ отдельно. Тот же
// принцип разделения, что у addons.routes.js — отдельный чек-аут, своя
// сохранённая карта, не объединяем с базовой автоматически.
router.post(
  '/checkout',
  requireAuth,
  requireTenant,
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT name, ai_advisor_subscription_price_rub AS "priceRub" FROM companies WHERE id = $1',
      [req.tenant.companyId]
    );
    const company = rows[0];
    const priceRub = company.priceRub;
    const returnUrl = `${process.env.FRONTEND_URL}/ai-advisor?payment=done`;

    const payment = await createPayment({
      amountRub: priceRub,
      description: `Подписка «ИИ-управляющий» — ${company.name}`,
      returnUrl,
      savePaymentMethod: true,
      metadata: { companyId: String(req.tenant.companyId), product: 'ai_advisor' },
      receiptEmail: req.user.email,
    });

    await pool.query(
      `INSERT INTO ai_advisor_subscription_payments (company_id, yookassa_payment_id, amount_rub, status, is_recurring_charge)
       VALUES ($1, $2, $3, 'pending', false)`,
      [req.tenant.companyId, payment.id, priceRub]
    );

    res.json({ confirmationUrl: payment.confirmation.confirmation_url });
  })
);

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

// Отмена (01.09.2026 — юридический аудит перед передачей оферты юристу:
// оферта §3.4(а) обещает "отменить в любой момент через интерфейс Сервиса",
// а этого эндпоинта и кнопки физически не было ни разу с 19.08.2026, когда
// эта подписка стала настоящей рекуррентной). Сразу переводит в 'cancelled'
// без grace-периода до конца оплаченного месяца — в отличие от
// requirePaidPlan (базовая подписка, миграция 0044/PAST_DUE_GRACE_DAYS),
// requireAiAdvisorSubscription (core/middleware/subscription.js) уже
// намеренно не даёт grace для 'cancelled': это "продолжающаяся услуга"
// (советники считают по актуальным данным при каждом обращении), не
// разово выданный PDF — комментарий у гейта объясняет это явно, это не
// баг, который здесь надо чинить, а уже принятое решение, которому этот
// эндпоинт просто следует.
router.post(
  '/cancel',
  requireAuth,
  requireTenant,
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE companies SET ai_advisor_subscription_status = 'cancelled'
       WHERE id = $1 AND ai_advisor_subscription_status IN ('active', 'past_due')
       RETURNING id`,
      [req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Активной подписки для отмены нет' });
    }
    res.json({ ok: true });
  })
);

// Отменить отмену — тот же принцип, что /platform/subscription/reactivate,
// но без проверки period_end (её тут нет, см. комментарий у /cancel выше):
// просто возвращает доступ и рекуррентные списания с ближайшего
// chargeRecurringSubscriptions.js по уже сохранённому способу оплаты.
router.post(
  '/reactivate',
  requireAuth,
  requireTenant,
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE companies SET ai_advisor_subscription_status = 'active'
       WHERE id = $1 AND ai_advisor_subscription_status = 'cancelled'
       RETURNING id`,
      [req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Восстановить эту подписку уже нельзя — оформите новую' });
    }
    res.json({ ok: true });
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
