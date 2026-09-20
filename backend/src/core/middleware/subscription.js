const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { PAST_DUE_GRACE_DAYS } = require('../subscriptionGrace');

// "Оплачено" = статус active, либо cancelled/past_due, но ещё в пределах
// уже оплаченного периода (subscription_current_period_end в будущем).
// До 21.08.2026 тут была версия "любой статус кроме trial" — то есть
// человек, заплативший ОДИН раз, получал доступ НАВСЕГДА, даже отменив
// подписку сразу после первого списания и никогда больше не платя. Владелец
// прямо попросил это исправить: отмена должна реально прекращать доступ по
// окончании уже оплаченного периода, не мгновенно (человек должен
// использовать то, за что заплатил) и не бессрочно (иначе подписка не
// отличается от разовой покупки навсегда).
// Вынесено в отдельную функцию (19.08.2026) — нужна не только как middleware
// "да/нет для всего роута", но и как обычная проверка внутри обработчика
// /reports/:id/download (report.routes.js), которому нужно ЕЩЁ одно условие
// прохода (разовая покупка конкретного отчёта) в дополнение к этому.
async function isSubscriptionActive(companyId) {
  const { rows } = await pool.query(
    'SELECT subscription_status, subscription_current_period_end FROM companies WHERE id = $1',
    [companyId]
  );
  const row = rows[0];
  if (!row || !row.subscription_status || row.subscription_status === 'trial') return false;
  if (row.subscription_status === 'active') return true;
  if (!row.subscription_current_period_end) return false;
  const periodEnd = new Date(row.subscription_current_period_end);
  // cancelled — доступ ровно до конца уже оплаченного периода, без бонусных
  // дней (человек сам решил не продлевать, ждать тут нечего).
  // past_due — то же самое ПЛЮС грейс-период (PAST_DUE_GRACE_DAYS): списание
  // не удалось не по воле Пользователя (карта/банк), даём время на повторную
  // попытку (chargeRecurringSubscriptions.js) и на замену способа оплаты,
  // прежде чем реально закрыть доступ — то же окно, в которое скрипт ещё
  // пробует списать, иначе доступ закрылся бы раньше, чем кончились попытки.
  if (row.subscription_status === 'past_due') {
    const graceEnd = new Date(periodEnd);
    graceEnd.setDate(graceEnd.getDate() + PAST_DUE_GRACE_DAYS);
    return graceEnd > new Date();
  }
  return periodEnd > new Date();
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
  const { rows } = await pool.query('SELECT free_addons AS "freeAddons" FROM companies WHERE id = $1', [req.tenant.companyId]);
  if (rows[0]?.freeAddons || (await isSubscriptionActive(req.tenant.companyId))) {
    return next();
  }
  return res.status(402).json({
    error: 'Скачивание PDF доступно после оплаты подписки на платформу',
    requiresSubscription: true,
  });
});

// ИИ-советник входит в подписку (20.09.2026, решение владельца). Раньше
// (06.09.2026) это была надбавка +990 ₽ за флагом ai_advisor_subscription_
// status — теперь доступ даёт сам факт оплаченной подписки (та же
// isSubscriptionActive, что у остальных платных разделов). free_addons
// (ручной бесплатный доступ из админки) по-прежнему обходит проверку.
// Пробный период доступа НЕ даёт: гостевой тест (anonymous-audit/start)
// создаёт компанию с таким же триалом без почты и капчи — открыть ИИ триалу
// значило бы открыть платную ИИ-стоимость для любого бота (см. разбор
// защиты от копирования 20.09.2026).
const requireAiAdvisorSubscription = asyncHandler(async (req, res, next) => {
  const { rows } = await pool.query(`SELECT free_addons AS "freeAddons" FROM companies WHERE id = $1`, [req.tenant.companyId]);
  if (rows[0]?.freeAddons) return next();
  if (await isSubscriptionActive(req.tenant.companyId)) return next();
  return res.status(402).json({
    error: 'ИИ-советник входит в подписку — оформите её в разделе «Подписка»',
    requiresAiAdvisorSubscription: true,
  });
});

module.exports = { requirePaidPlan, requirePaidPlanOrFreeAddons, requireAiAdvisorSubscription, isSubscriptionActive };
