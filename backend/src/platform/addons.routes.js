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
router.post(
  '/:addonKey/checkout',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const addon = getAddon(req.params.addonKey);
    if (!addon) return res.status(400).json({ error: 'Неизвестная надстройка' });

    const already = await pool.query(
      `SELECT 1 FROM addon_purchases WHERE company_id = $1 AND addon_key = $2 AND status = 'succeeded' LIMIT 1`,
      [req.tenant.companyId, req.params.addonKey]
    );
    if (already.rows.length > 0) {
      return res.status(409).json({ error: 'Уже оплачено' });
    }

    const { rows } = await pool.query('SELECT name FROM companies WHERE id = $1', [req.tenant.companyId]);
    const company = rows[0];
    const returnUrl = `${process.env.FRONTEND_URL}/security?addonPayment=done`;

    const payment = await createPayment({
      amountRub: addon.priceRub,
      description: `${addon.label} — ${company.name}`,
      returnUrl,
      savePaymentMethod: false,
      metadata: { companyId: String(req.tenant.companyId), addonKey: req.params.addonKey },
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
