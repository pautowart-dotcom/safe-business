const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { createPayment, getPayment } = require('../core/yookassa');
const { sendPushToSuperAdmins } = require('../core/pushNotify');
const { notifyAddonPurchase } = require('./addons.routes');
const { handleAiAdvisorSubscriptionWebhook } = require('./ai-advisor-subscription.routes');
const { fulfillGuestReport } = require('./anonymous-audit.routes');

const SUBSCRIPTION_PRICE_RUB = 1990;

const router = express.Router();

// Общая часть чек-аута для двух режимов ниже.
async function startCheckout({ companyId, description, returnUrl, savePaymentMethod, reportId }) {
  const payment = await createPayment({
    amountRub: SUBSCRIPTION_PRICE_RUB,
    description,
    returnUrl,
    savePaymentMethod,
    metadata: { companyId: String(companyId) },
  });

  await pool.query(
    `INSERT INTO subscription_payments (company_id, yookassa_payment_id, amount_rub, status, is_recurring_charge, report_id)
     VALUES ($1, $2, $3, 'pending', false, $4)`,
    [companyId, payment.id, SUBSCRIPTION_PRICE_RUB, reportId || null]
  );

  return payment;
}

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
    const payment = await startCheckout({
      companyId: req.tenant.companyId,
      description: `Подписка «Безопасный бизнес» — ${company.name}`,
      returnUrl: `${process.env.FRONTEND_URL}/subscription?payment=done`,
      savePaymentMethod: true,
    });
    res.json({ confirmationUrl: payment.confirmation.confirmation_url });
  })
);

// Разовая покупка ОДНОГО отчёта (19.08.2026, п.5 плана; исправлено в этот
// же день — см. миграцию 0091). Первая версия ставила companies.
// subscription_status='active' напрямую — владелец справедливо указал, что
// это делает разовую покупку СТРОГО ВЫГОДНЕЕ подписки: та же цена (1990 ₽),
// но постоянный доступ вообще ко всему (PDF отчётов + допечатка журналов +
// ИИ-советники), без повторных списаний — подписка в таком виде была бы
// бессмысленна, никто бы её не оформлял. Исправление: платёж привязан к
// КОНКРЕТНОМУ отчёту (reportId, обязателен) — открывает скачивание именно
// этого PDF навсегда (requirePaidPlan НЕ трогается, см. inline-проверку в
// report.routes.js), но НЕ подписку компании целиком — журналы и
// ИИ-советники (requirePaidPlan/requirePaidPlanOrFreeAddons) по-прежнему
// требуют настоящей подписки.
router.post(
  '/checkout-one-time',
  requireAuth,
  requireTenant,
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const reportId = Number(req.body?.reportId);
    if (!reportId) return res.status(400).json({ error: 'Не указан отчёт для разблокировки' });

    const { rows: reportRows } = await pool.query(
      'SELECT id FROM security_reports WHERE id = $1 AND company_id = $2',
      [reportId, req.tenant.companyId]
    );
    if (reportRows.length === 0) return res.status(404).json({ error: 'Отчёт не найден' });

    // Гость анонимного аудита (platform/anonymous-audit.routes.js,
    // 19.08.2026) — здесь, а не при создании гостевого аккаунта, впервые
    // указывает реальный email и явно принимает оферту/политику: именно тут
    // происходит реальное действие (платёж), где это по-настоящему нужно —
    // тот же принцип, что и у обычной регистрации (accepted_terms_at
    // проставляется при /auth/register, не раньше). Для НЕ-гостя (обычный
    // залогиненный владелец) оба поля игнорируются — у него уже есть
    // подтверждённый email и оферта принята при регистрации.
    const { rows: userRows } = await pool.query('SELECT is_guest, email FROM users WHERE id = $1', [req.user.id]);
    const isGuest = !!userRows[0]?.is_guest;
    if (isGuest) {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Укажите email, на который прислать отчёт' });
      }
      if (!req.body?.acceptedTerms) {
        return res.status(400).json({ error: 'Нужно принять условия оферты и политики конфиденциальности' });
      }
      const existing = await pool.query('SELECT 1 FROM users WHERE email = $1 AND id != $2', [email, req.user.id]);
      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: 'Этот email уже зарегистрирован на платформе — войдите в аккаунт, чтобы получить отчёт там',
        });
      }
      await pool.query(
        'UPDATE users SET email = $2, accepted_terms_at = now(), analytics_consent = $3 WHERE id = $1',
        [req.user.id, email, !!req.body?.analyticsConsent]
      );
    }

    const { rows } = await pool.query('SELECT name FROM companies WHERE id = $1', [req.tenant.companyId]);
    const company = rows[0];
    // Единственный путь сюда из интерфейса — гостевой анонимный аудит без
    // регистрации (AnonymousAudit.jsx, /lk/audit); кнопка "купить один раз"
    // для уже зарегистрированных владельцев убрана из Security.jsx 19.08.2026
    // (решение владельца — если готов регистрироваться, выбирает подписку
    // или нет, без промежуточного варианта). Гость всё равно не смог бы
    // попасть на /security — она за PrivateRoute, а войти он не может, у
    // него нет пароля.
    const payment = await startCheckout({
      companyId: req.tenant.companyId,
      description: `Разовая покупка отчёта «Безопасный бизнес» — ${company.name}`,
      returnUrl: `${process.env.FRONTEND_URL}/audit?payment=done`,
      savePaymentMethod: false,
      reportId,
    });
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
      `SELECT sp.company_id, sp.amount_rub, sp.is_recurring_charge, sp.report_id, c.name AS company_name
       FROM subscription_payments sp JOIN companies c ON c.id = sp.company_id
       WHERE sp.yookassa_payment_id = $1`,
      [paymentId]
    );
    if (rows.length === 0) {
      // Не платёж за базовую подписку — проверяем по цепочке остальные
      // типы платежей, которые шлют уведомления на этот же URL (ЮKassa даёт
      // только один webhook-адрес на магазин): сперва подписка на
      // ИИ-управляющего (ai-advisor-subscription.routes.js, миграция 0090),
      // затем разовые надстройки (core/addons.js, миграция 0075).
      const handled = await handleAiAdvisorSubscriptionWebhook(paymentId, payment, res);
      if (handled) return;
      return handleAddonWebhook(paymentId, payment, res);
    }
    const {
      company_id: companyId,
      amount_rub: amountRub,
      is_recurring_charge: isRecurringCharge,
      report_id: reportId,
      company_name: companyName,
    } = rows[0];

    if (payment.status === 'succeeded') {
      await pool.query(
        `UPDATE subscription_payments SET status = 'succeeded', confirmed_at = now() WHERE yookassa_payment_id = $1`,
        [paymentId]
      );

      if (reportId) {
        // Разовая покупка ОДНОГО отчёта (миграция 0091) — НЕ трогает
        // subscription_status компании вообще, см. комментарий у
        // /checkout-one-time выше.
        await pool.query(`UPDATE security_reports SET unlocked_without_subscription = true WHERE id = $1`, [reportId]);

        // Гость анонимного аудита (19.08.2026) не может зайти и скачать
        // PDF сам (нет пароля) — no-op для обычных (не гостевых) покупателей,
        // см. fulfillGuestReport. Не должно ронять/задерживать ответ ЮKassa
        // на вебхук — письмо не критичнее самого факта оплаты.
        fulfillGuestReport({ companyId, reportId }).catch((err) =>
          console.error('fulfillGuestReport failed:', err)
        );
      } else {
        const nextPeriodEnd = new Date();
        nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);
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
      }

      // Push владельцу платформы (обсуждение 09.08.2026) — и первый платёж,
      // и ежемесячное автосписание, и разовая покупка отчёта одинаково
      // интересны ("кто платит"). fire-and-forget, не должен задерживать
      // ответ ЮKassa на вебхук.
      sendPushToSuperAdmins({
        title: reportId ? 'Разовая покупка отчёта' : isRecurringCharge ? 'Автосписание прошло' : 'Новая оплата',
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
