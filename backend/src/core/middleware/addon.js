const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');

// Разовая покупка (см. core/addons.js, миграция 0075) — в отличие от
// requirePaidPlan (core/middleware/subscription.js) здесь нет периода
// действия: одна успешная запись в addon_purchases = доступ навсегда,
// поэтому проверка — просто "есть ли хоть одна succeeded строка", без дат.
//
// companies.free_addons (миграция 0088) — обходной флаг для "своих" компаний
// владельца: пропускает проверку покупки целиком, для любого addonKey.
// Нужен, чтобы обкатывать платные фичи (например ИИ-советник по марже) на
// собственных студиях бесплатно, прежде чем открывать продажу остальным.
function requireAddon(addonKey) {
  return asyncHandler(async (req, res, next) => {
    const { rows } = await pool.query(
      `SELECT c.free_addons AS "freeAddons",
              EXISTS(
                SELECT 1 FROM addon_purchases
                WHERE company_id = c.id AND addon_key = $2 AND status = 'succeeded'
              ) AS purchased
       FROM companies c WHERE c.id = $1`,
      [req.tenant.companyId, addonKey]
    );
    const row = rows[0];
    if (row && (row.freeAddons || row.purchased)) return next();
    return res.status(402).json({ error: 'Эта функция доступна после разовой оплаты', requiresAddon: addonKey });
  });
}

module.exports = { requireAddon };
