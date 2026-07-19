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

module.exports = { requirePaidPlan };
