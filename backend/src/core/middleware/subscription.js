const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');

// "Оплачено" = компания хотя бы раз перешла с триала на платный тариф.
// past_due/cancelled тоже пропускаем: подписка была активирована однажды,
// доступ к уже открытому контенту не отзываем задним числом при просрочке
// или отмене — только 'trial' (включая ещё не начатую подписку) блокирует.
// Вынесено в отдельную функцию (19.08.2026) — нужна не только как middleware
// "да/нет для всего роута", но и как обычная проверка внутри обработчика
// /reports/:id/download (report.routes.js), которому нужно ЕЩЁ одно условие
// прохода (разовая покупка конкретного отчёта) в дополнение к этому.
async function isSubscriptionActive(companyId) {
  const { rows } = await pool.query('SELECT subscription_status FROM companies WHERE id = $1', [companyId]);
  const status = rows[0]?.subscription_status;
  return !!status && status !== 'trial';
}

const requirePaidPlan = asyncHandler(async (req, res, next) => {
  if (await isSubscriptionActive(req.tenant.companyId)) return next();
  return res.status(402).json({
    error: 'Скачивание PDF доступно после оплаты подписки на платформу',
    requiresSubscription: true,
  });
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

// Настоящая допподписка на ИИ-управляющего (миграция 0090, 19.08.2026) —
// в отличие от requirePaidPlanOrFreeAddons здесь не важен статус базовой
// подписки платформы вообще, только собственный статус этой конкретной
// подписки. 'active'/'past_due' пропускаем (past_due — грейс-период на
// случай, если автосписание не прошло из-за карты, доступ не отключаем
// молча, см. chargeRecurringSubscriptions.js); 'cancelled'/'inactive'
// блокируют — в отличие от requirePaidPlan для базовой подписки, здесь
// отмена подписки должна реально останавливать доступ к продолжающейся
// ежемесячной услуге, а не только к разово выданному контенту (PDF).
const requireAiAdvisorSubscription = asyncHandler(async (req, res, next) => {
  const { rows } = await pool.query(
    `SELECT ai_advisor_subscription_status AS status, free_addons AS "freeAddons" FROM companies WHERE id = $1`,
    [req.tenant.companyId]
  );
  const row = rows[0];
  if (row && (row.freeAddons || row.status === 'active' || row.status === 'past_due')) {
    return next();
  }
  return res.status(402).json({
    error: 'ИИ-управляющий доступен по отдельной ежемесячной подписке',
    requiresAiAdvisorSubscription: true,
  });
});

module.exports = { requirePaidPlan, requirePaidPlanOrFreeAddons, requireAiAdvisorSubscription, isSubscriptionActive };
