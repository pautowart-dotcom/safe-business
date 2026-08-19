const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');

// "Оплачено" = компания хотя бы раз перешла с триала на платный тариф.
// past_due/cancelled тоже пропускаем: подписка была активирована однажды,
// доступ к уже открытому контенту не отзываем задним числом при просрочке
// или отмене — только 'trial' (включая ещё не начатую подписку) блокирует.
const requirePaidPlan = asyncHandler(async (req, res, next) => {
  const { rows } = await pool.query('SELECT subscription_status FROM companies WHERE id = $1', [req.tenant.companyId]);
  const status = rows[0]?.subscription_status;
  if (!status || status === 'trial') {
    return res.status(402).json({
      error: 'Скачивание PDF доступно после оплаты подписки на платформу',
      requiresSubscription: true,
    });
  }
  next();
});

// Тот же гейт, что requirePaidPlan, но с ручной лазейкой: если владелец
// вручную включил companies.free_addons = true этой компании (админка,
// PATCH /platform/admin/companies/:id/free-addons — тот же флаг, что даёт
// бесплатный доступ к платным надстройкам, см. миграцию 0088 и
// core/middleware/addon.js), пропускаем ИИ-советников даже в статусе
// 'trial'. Один запрос вместо requirePaidPlan + requireAddon подряд.
const requirePaidPlanOrFreeAddons = asyncHandler(async (req, res, next) => {
  const { rows } = await pool.query(
    'SELECT subscription_status, free_addons AS "freeAddons" FROM companies WHERE id = $1',
    [req.tenant.companyId]
  );
  const row = rows[0];
  if (row && (row.freeAddons || (row.subscription_status && row.subscription_status !== 'trial'))) {
    return next();
  }
  return res.status(402).json({
    error: 'Скачивание PDF доступно после оплаты подписки на платформу',
    requiresSubscription: true,
  });
});

module.exports = { requirePaidPlan, requirePaidPlanOrFreeAddons };
