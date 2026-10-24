const pool = require('../db/pool');

// Промокоды (миграция 0128, решения владельца 08.10.2026):
// - скидка только на ПЕРВЫЙ платёж подписки, дальше обычная цена; или на
//   разовую покупку отчёта в гостевом тесте с лендинга (applies_to='report');
// - тип — процент или фиксированная сумма;
// - лимит использований и срок задаются в админке;
// - до ответа юриста по оферте коды работают только для тестовых компаний,
//   пока на сервере не стоит PROMO_CODES_ENABLED=true.
// Вынесено отдельно от subscription.routes.js: та же проверка нужна и для
// предпросмотра цены (/promo/check), и для самого чек-аута — расходиться
// они не должны.

// ЮKassa не принимает платёж меньше 1 ₽ — поэтому 100% скидки нет, а
// бесплатный период — отдельная задача (не через платёж).
const MIN_PAYMENT_RUB = 1;

function normalizeCode(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase();
}

function isValidCodeFormat(code) {
  return /^[\p{L}\p{N}_-]{3,32}$/u.test(code);
}

function promoError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function calcDiscount(promo, priceRub) {
  const raw = promo.discount_type === 'percent' ? Math.round((priceRub * promo.discount_value) / 100) : promo.discount_value;
  return Math.max(0, Math.min(raw, priceRub - MIN_PAYMENT_RUB));
}

// Возвращает { promo, discountRub, finalRub } или бросает ошибку со status=400
// и понятным человеку текстом. Лимит считается по успешным оплатам — две
// одновременные оплаты по последнему "месту" могут обе пройти; для ручных
// кодов владельца это приемлемо, не стоит блокировок.
async function evaluatePromo({ code: rawCode, companyId, appliesTo, priceRub }) {
  const code = normalizeCode(rawCode);
  if (!code) throw promoError('Введите промокод');
  if (!isValidCodeFormat(code)) throw promoError('Такого промокода нет');

  const { rows } = await pool.query('SELECT * FROM promo_codes WHERE code = $1', [code]);
  const promo = rows[0];
  if (!promo || !promo.active) throw promoError('Такого промокода нет');

  // Обкатка: без флага — только тестовые компании или коды с галкой
  // «тестовый» (гость теста с лендинга — новая компания без is_test, иначе
  // владелец не смог бы проверить этот поток на себе).
  if (process.env.PROMO_CODES_ENABLED !== 'true' && !promo.test_only) {
    const { rows: companyRows } = await pool.query('SELECT is_test FROM companies WHERE id = $1', [companyId]);
    if (!companyRows[0]?.is_test) throw promoError('Промокоды пока не действуют');
  }

  if (promo.applies_to !== appliesTo) {
    const WHAT = { report: 'на отчёт в бесплатном тесте с сайта', subscription: 'на подписку', templates: 'на документы студии' };
    throw promoError(`Этот промокод — ${WHAT[promo.applies_to] || 'на другую покупку'}`);
  }
  if (promo.valid_until && new Date(promo.valid_until) < new Date()) throw promoError('Срок действия промокода закончился');

  if (promo.max_redemptions != null) {
    const { rows: usedRows } = await pool.query(
      `SELECT (SELECT COUNT(*) FROM subscription_payments WHERE promo_code_id = $1 AND status = 'succeeded')
            + (SELECT COUNT(*) FROM addon_purchases WHERE promo_code_id = $1 AND status = 'succeeded') AS used`,
      [promo.id]
    );
    if (Number(usedRows[0].used) >= promo.max_redemptions) throw promoError('Промокод уже использовали максимальное число раз');
  }

  if (appliesTo === 'subscription') {
    // "Первый платёж" — у компании ещё не было ни одной успешной оплаты
    // подписки (разовые покупки отчёта, report_id IS NOT NULL, не считаются).
    const { rows: paidRows } = await pool.query(
      `SELECT 1 FROM subscription_payments WHERE company_id = $1 AND status = 'succeeded' AND report_id IS NULL LIMIT 1`,
      [companyId]
    );
    if (paidRows.length > 0) throw promoError('Промокод действует только на первую оплату подписки');
  } else if (appliesTo === 'report') {
    // Разовый отчёт: у компании ещё не было успешной разовой покупки. Гость
    // может пройти тест заново (новая компания) — от этого защищает лимит
    // использований кода, его стоит ставить на коды для раздачи.
    const { rows: paidRows } = await pool.query(
      `SELECT 1 FROM subscription_payments WHERE company_id = $1 AND status = 'succeeded' AND report_id IS NOT NULL LIMIT 1`,
      [companyId]
    );
    if (paidRows.length > 0) throw promoError('Промокод действует только на первую покупку отчёта');
  }

  const discountRub = calcDiscount(promo, priceRub);
  return { promo, discountRub, finalRub: priceRub - discountRub };
}

// Набор «заключение + документы» (24.10.2026, решение владельца: промокод —
// везде). Отдельного типа кода для набора нет: код на отчёт даёт в наборе ту
// же скидку, что дал бы на отчёт (процент — от цены отчёта, не набора), код
// на документы — ту же, что на документы. Не подошёл ни так, ни так —
// ошибка проверки как для отчёта.
async function evaluateBundlePromo({ code, companyId, reportPriceRub, docsPriceRub, bundlePriceRub }) {
  let firstError = null;
  for (const [appliesTo, partPriceRub] of [['report', reportPriceRub], ['templates', docsPriceRub]]) {
    try {
      const { promo, discountRub } = await evaluatePromo({ code, companyId, appliesTo, priceRub: partPriceRub });
      const bundleDiscountRub = Math.min(discountRub, bundlePriceRub - MIN_PAYMENT_RUB);
      return { promo, discountRub: bundleDiscountRub, finalRub: bundlePriceRub - bundleDiscountRub };
    } catch (err) {
      if (!err.status) throw err;
      firstError = firstError || err;
    }
  }
  throw firstError;
}

module.exports = { evaluatePromo, evaluateBundlePromo, normalizeCode, isValidCodeFormat, MIN_PAYMENT_RUB };
