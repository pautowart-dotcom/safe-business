const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { createPayment } = require('../core/yookassa');
const { ADDON_CATALOG, getAddon } = require('../core/addons');
const { sendPushToSuperAdmins } = require('../core/pushNotify');

const router = express.Router();

router.use(requireAuth, requireTenant);

// Весь каталог (цена/название берутся из core/addons.js — единственного
// места с ценой) + отметка, что уже куплено этой компанией. Фронт не
// хардкодит цену, только показывает то, что отдал сервер.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT addon_key FROM addon_purchases WHERE company_id = $1 AND status = 'succeeded'`,
      [req.tenant.companyId]
    );
    const purchased = new Set(rows.map((r) => r.addon_key));
    res.json(
      Object.entries(ADDON_CATALOG).map(([key, addon]) => ({
        addonKey: key,
        label: addon.label,
        priceRub: addon.priceRub,
        purchased: purchased.has(key),
      }))
    );
  })
);

// Разовый платёж (savePaymentMethod не передаём — в отличие от базовой
// подписки здесь нет автосписаний, повторной оплаты этого addon_key для
// той же компании не будет). Отдельный чек-аут всегда, даже если у
// компании уже есть сохранённая карта от базовой подписки — владелец
// решил (12.08.2026) не объединять два разных платежа автоматически.
//
// requireTestCompany, который здесь был (фикс 12.08.2026 — без него
// любая компания могла заплатить за функцию, которая всё равно оставалась
// недоступной), снят 13.08.2026 вместе с тестовым гейтом на самом модуле
// document-templates — раз функция открыта всем, чек-аут ведёт к реально
// доступной покупке, отдельная проверка больше не нужна.
router.post(
  '/:addonKey/checkout',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const addon = getAddon(req.params.addonKey);
    if (!addon) return res.status(400).json({ error: 'Неизвестная надстройка' });

    // website_check — не "разблокировать навсегда" (как document_templates),
    // а "оплатить ещё один скан" — повторная покупка должна быть возможна
    // (сайт меняется, захотят перепроверить). Гейт "уже оплачено" остаётся
    // только для остальных addon_key из каталога.
    if (req.params.addonKey !== 'website_check') {
      const already = await pool.query(
        `SELECT 1 FROM addon_purchases WHERE company_id = $1 AND addon_key = $2 AND status = 'succeeded' LIMIT 1`,
        [req.tenant.companyId, req.params.addonKey]
      );
      if (already.rows.length > 0) {
        return res.status(409).json({ error: 'Уже оплачено' });
      }
    }

    // Гость анонимного теста (is_guest, см. anonymous-audit.routes.js) не
    // может попасть на /security — она за PrivateRoute, а войти ему нечем
    // (нет пароля, email — плейсхолдер guest-*@guest.business-safe.internal).
    // Тот же приём, что и в subscription.routes.js (checkout-one-time):
    // возвращаем на публичную /audit, а email/согласие на оферту берём из
    // тела запроса и сохраняем ДО оплаты — иначе чек ЮKassa и письмо с
    // результатом ушли бы на несуществующий плейсхолдер-адрес.
    const { rows: userRows } = await pool.query('SELECT is_guest, email FROM users WHERE id = $1', [req.user.id]);
    const isGuest = !!userRows[0]?.is_guest;
    let receiptEmail = req.user.email;
    const returnUrl = isGuest
      ? `${process.env.FRONTEND_URL}/audit?payment=done`
      : `${process.env.FRONTEND_URL}/security?addonPayment=done`;

    if (isGuest) {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Укажите email, на который прислать результат' });
      }
      if (!req.body?.acceptedTerms) {
        return res.status(400).json({ error: 'Нужно принять условия оферты и политики конфиденциальности' });
      }
      const existing = await pool.query('SELECT 1 FROM users WHERE email = $1 AND id != $2', [email, req.user.id]);
      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: 'Этот email уже зарегистрирован на платформе — войдите в аккаунт, чтобы купить там',
        });
      }
      await pool.query(
        'UPDATE users SET email = $2, accepted_terms_at = now(), analytics_consent = $3 WHERE id = $1',
        [req.user.id, email, !!req.body?.analyticsConsent]
      );
      receiptEmail = email;
    }

    const { rows } = await pool.query('SELECT name FROM companies WHERE id = $1', [req.tenant.companyId]);
    const company = rows[0];

    const metadata = { companyId: String(req.tenant.companyId), addonKey: req.params.addonKey };

    // website_check — единственный addon, которому нужен вход-параметр
    // (адрес сайта) уже на чек-ауте: строку заводим сейчас, статус
    // 'awaiting_payment', id прокидываем через metadata (тот же приём, что
    // и subscription_payments.report_id, миграция 0091) — вебхук
    // (subscription.routes.js) найдёт её по этому id и запустит скан.
    if (req.params.addonKey === 'website_check') {
      const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      if (!url) return res.status(400).json({ error: 'Укажите адрес сайта' });
      const source = req.body?.source === 'test' ? 'test' : 'standalone';
      const checkRows = await pool.query(
        `INSERT INTO website_checks (company_id, url, source, status)
         VALUES ($1, $2, $3, 'awaiting_payment') RETURNING id`,
        [req.tenant.companyId, url, source]
      );
      metadata.websiteCheckId = String(checkRows.rows[0].id);
    }

    const payment = await createPayment({
      amountRub: addon.priceRub,
      description: `${addon.label} — ${company.name}`,
      returnUrl,
      savePaymentMethod: false,
      metadata,
      receiptEmail,
    });

    await pool.query(
      `INSERT INTO addon_purchases (company_id, addon_key, yookassa_payment_id, amount_rub, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [req.tenant.companyId, req.params.addonKey, payment.id, addon.priceRub]
    );

    res.json({ confirmationUrl: payment.confirmation.confirmation_url });
  })
);

// Вебхук ЮKassa на addon-платежи обрабатывается ВНУТРИ существующего
// POST /platform/subscription/webhook (см. комментарий там) — ЮKassa шлёт
// уведомления на один-единственный URL, указанный в личном кабинете
// магазина, вне зависимости от того, какой именно товар оплачивался.
// Заводить второй webhook-роут здесь означало бы просить владельца
// вручную прописывать второй URL в настройках ЮKassa — не нужно.

// Push владельцу платформы о новой addon-оплате — вызывается из webhook
// в subscription.routes.js, вынесено сюда как отдельная функция, чтобы
// не плодить SQL-запросы к addon_purchases в чужом файле.
async function notifyAddonPurchase({ companyId, addonKey }) {
  const addon = getAddon(addonKey);
  const { rows } = await pool.query('SELECT name FROM companies WHERE id = $1', [companyId]);
  await sendPushToSuperAdmins({
    title: 'Оплата надстройки',
    body: `${rows[0]?.name || 'Компания'} — ${addon?.label || addonKey}, ${addon?.priceRub ?? '?'} ₽`,
    url: '/office/companies',
  }).catch((err) => console.error('sendPushToSuperAdmins (addon) failed:', err));
}

module.exports = router;
module.exports.notifyAddonPurchase = notifyAddonPurchase;
