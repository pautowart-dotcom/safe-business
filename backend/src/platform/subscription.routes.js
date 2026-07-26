const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { createPayment, getPayment } = require('../core/yookassa');

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
// магазина ЮKassa: https://lk.business-safe.ru/api/platform/subscription/webhook
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
      'SELECT company_id FROM subscription_payments WHERE yookassa_payment_id = $1',
      [paymentId]
    );
    if (rows.length === 0) return res.status(200).end();
    const companyId = rows[0].company_id;

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
    } else if (payment.status === 'canceled') {
      await pool.query(`UPDATE subscription_payments SET status = 'canceled' WHERE yookassa_payment_id = $1`, [paymentId]);
    }

    res.status(200).end();
  })
);

module.exports = router;
