const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { createPayment, getPayment } = require('../core/yookassa');
const { sendPushToSuperAdmins } = require('../core/pushNotify');
const { notifyAddonPurchase } = require('./addons.routes');

const SUBSCRIPTION_PRICE_RUB = 1990;

const router = express.Router();

// Оформление подписки — создаёт первый платёж и просит ЮKassa сохранить
// способ оплаты, чтобы дальше списывать автоматически раз в месяц
// (chargeRecurringSubscriptions.js) без участия владельца/админа.
router.post(
  '/checkout',
  requireAuth,
  requireTenant,
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT name FROM companies WHERE id = $1', [req.tenant.companyId]);
    const company = rows[0];
    const returnUrl = `${process.env.FRONTEND_URL}/subscription?payment=done`;

    const payment = await createPayment({
      amountRub: SUBSCRIPTION_PRICE_RUB,
      description: `Подписка «Безопасный бизнес» — ${company.name}`,
      returnUrl,
      savePaymentMethod: true,
      metadata: { companyId: String(req.tenant.companyId) },
    });

    await pool.query(
      `INSERT INTO subscription_payments (company_id, yookassa_payment_id, amount_rub, status, is_recurring_charge)
       VALUES ($1, $2, $3, 'pending', false)`,
      [req.tenant.companyId, payment.id, SUBSCRIPTION_PRICE_RUB]
    );

    res.json({ confirmationUrl: payment.confirmation.confirmation_url });
  })
);

// Вебхук ЮKassa — публичный маршрут (без requireAuth), ЮKassa стучится сюда
// сама, без пользовательской сессии. URL нужно один раз указать в настройках
// магазина ЮKassa: https://business-safe.ru/api/platform/subscription/webhook
// (сменился с lk.business-safe.ru/... при переезде на однодоменную схему,
// см. deploy/nginx.conf — если уже был указан старый URL в личном кабинете
// ЮKassa, его нужно обновить там вручную, отдельным шагом)
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const paymentId = req.body?.object?.id;
    if (!paymentId) return res.status(400).end();

    // Уведомления ЮKassa не подписаны — не доверяем статусу/сумме из тела
    // запроса, перепроверяем платёж напрямую через API по его id.
    let payment;
    try {
      payment = await getPayment(paymentId);
    } catch (err) {
      console.error('subscription webhook: getPayment failed', err);
      return res.status(200).end();
    }

    const { rows } = await pool.query(
      `SELECT sp.company_id, sp.amount_rub, sp.is_recurring_charge, c.name AS company_name
       FROM subscription_payments sp JOIN companies c ON c.id = sp.company_id
       WHERE sp.yookassa_payment_id = $1`,
      [paymentId]
    );
    if (rows.length === 0) {
      // Не платёж за базовую подписку — проверяем, не разовая ли это
      // надстройка (core/addons.js, миграция 0075). Один и тот же URL
      // получает уведомления про оба типа платежей, см. addons.routes.js.
      return handleAddonWebhook(paymentId, payment, res);
    }
    const { company_id: companyId, amount_rub: amountRub, is_recurring_charge: isRecurringCharge, company_name: companyName } = rows[0];

    if (payment.status === 'succeeded') {
      const nextPeriodEnd = new Date();
      nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);

      await pool.query(
        `UPDATE subscription_payments SET status = 'succeeded', confirmed_at = now() WHERE yookassa_payment_id = $1`,
        [paymentId]
      );

      if (payment.payment_method?.saved && payment.payment_method?.id) {
        await pool.query(
          `UPDATE companies SET subscription_status = 'active', subscription_current_period_end = $2,
                                 yookassa_payment_method_id = $3
           WHERE id = $1`,
          [companyId, nextPeriodEnd, payment.payment_method.id]
        );
      } else {
        await pool.query(
          `UPDATE companies SET subscription_status = 'active', subscription_current_period_end = $2 WHERE id = $1`,
          [companyId, nextPeriodEnd]
        );
      }

      // Push владельцу платформы (обсуждение 09.08.2026) — и первый платёж,
      // и ежемесячное автосписание одинаково интересны ("кто платит").
      // fire-and-forget, не должен задерживать ответ ЮKassa на вебхук.
      sendPushToSuperAdmins({
        title: isRecurringCharge ? 'Автосписание прошло' : 'Новая оплата',
        body: `${companyName} — ${amountRub} ₽`,
        url: '/office/companies',
      }).catch((err) => console.error('sendPushToSuperAdmins (payment) failed:', err));
    } else if (payment.status === 'canceled') {
      await pool.query(`UPDATE subscription_payments SET status = 'canceled' WHERE yookassa_payment_id = $1`, [paymentId]);
    }

    res.status(200).end();
  })
);

// payment — уже перепроверенный через getPayment() объект от ЮKassa
// (см. вызов выше), не доверяем повторно телу исходного запроса.
async function handleAddonWebhook(paymentId, payment, res) {
  const { rows } = await pool.query(
    `SELECT company_id, addon_key FROM addon_purchases WHERE yookassa_payment_id = $1`,
    [paymentId]
  );
  if (rows.length === 0) return res.status(200).end();
  const { company_id: companyId, addon_key: addonKey } = rows[0];

  if (payment.status === 'succeeded') {
    await pool.query(
      `UPDATE addon_purchases SET status = 'succeeded', confirmed_at = now() WHERE yookassa_payment_id = $1`,
      [paymentId]
    );
    await notifyAddonPurchase({ companyId, addonKey });
  } else if (payment.status === 'canceled') {
    await pool.query(`UPDATE addon_purchases SET status = 'canceled' WHERE yookassa_payment_id = $1`, [paymentId]);
  }
  res.status(200).end();
}

module.exports = router;
