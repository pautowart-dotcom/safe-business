const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { isSubscriptionActive } = require('./subscription');

// POST /platform/website-check/scan — только бесплатный бонус подписчикам
// (или ручной обходной флаг free_addons, как у остальных надстроек,
// core/middleware/addon.js). Разовая покупка (addon_purchases,
// addon_key='website_check') сюда НЕ допускается — это оплата ОДНОГО скана,
// уже привязанного к конкретной оплате при чек-ауте (addons.routes.js
// создаёт строку website_checks и запускает скан сам через вебхук). Если бы
// "есть хоть одна succeeded покупка" открывала доступ и к этому роуту тоже
// (как в requireAddon для document_templates — там оплата НАВСЕГДА), одна
// оплата 990₽ давала бы бесконечные бесплатные проверки через этот эндпоинт
// — владелец прямо попросил (03.09.2026) не допускать бесплатного
// злоупотребления подпиской/покупкой.
const requireWebsiteCheckAccess = asyncHandler(async (req, res, next) => {
  const { rows } = await pool.query('SELECT free_addons AS "freeAddons" FROM companies WHERE id = $1', [
    req.tenant.companyId,
  ]);
  if (rows[0]?.freeAddons || (await isSubscriptionActive(req.tenant.companyId))) return next();
  return res.status(402).json({
    error: 'Проверка сайта доступна по подписке или разовой оплатой',
    requiresAddon: 'website_check',
  });
});

// Владелец решил (03.09.2026): бесплатный бонус подписчикам — не безлимит
// (иначе подписчик может гонять через нашу систему сколько угодно чужих
// сайтов вместо одного своего) — раз в 30 дней. Считаем только
// source='subscription' — оплаченные разовые проверки (source='standalone'/
// 'test') сюда не входят, за каждую уже заплатили отдельно.
const WEBSITE_CHECK_SUBSCRIPTION_INTERVAL_DAYS = 30;

async function findRecentSubscriptionCheck(companyId) {
  const { rows } = await pool.query(
    `SELECT created_at FROM website_checks
     WHERE company_id = $1 AND source = 'subscription'
       AND created_at > now() - interval '${WEBSITE_CHECK_SUBSCRIPTION_INTERVAL_DAYS} days'
     ORDER BY created_at DESC LIMIT 1`,
    [companyId]
  );
  return rows[0] || null;
}

module.exports = { requireWebsiteCheckAccess, findRecentSubscriptionCheck, WEBSITE_CHECK_SUBSCRIPTION_INTERVAL_DAYS };
