const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');

// Разовая покупка (см. core/addons.js, миграция 0075) — в отличие от
// requirePaidPlan (core/middleware/subscription.js) здесь нет периода
// действия: одна успешная запись в addon_purchases = доступ навсегда,
// поэтому проверка — просто "есть ли хоть одна succeeded строка", без дат.
function requireAddon(addonKey) {
  return asyncHandler(async (req, res, next) => {
    const { rows } = await pool.query(
      `SELECT 1 FROM addon_purchases WHERE company_id = $1 AND addon_key = $2 AND status = 'succeeded' LIMIT 1`,
      [req.tenant.companyId, addonKey]
    );
    if (rows.length === 0) {
      return res.status(402).json({ error: 'Эта функция доступна после разовой оплаты', requiresAddon: addonKey });
    }
    next();
  });
}

module.exports = { requireAddon };
