// Промокоды в кабинете платформы (09.10.2026) — владелец сам создаёт коды,
// задаёт лимит и срок, выключает; плюс отчёт "какой код → сколько человек и
// оплат". Коды не удаляются: на них ссылаются платежи (subscription_payments.
// promo_code_id), история отчёта должна сохраняться — только active=false.
// Проверка кода при оплате — core/promoCodes.js.
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireSuperAdmin } = require('../core/middleware/role');
const { normalizeCode, isValidCodeFormat } = require('../core/promoCodes');

const router = express.Router();
router.use(requireAuth, requireSuperAdmin);

const SELECT_WITH_STATS = `
  SELECT pc.id, pc.code, pc.discount_type AS "discountType", pc.discount_value AS "discountValue",
         pc.applies_to AS "appliesTo", pc.max_redemptions AS "maxRedemptions",
         pc.valid_until AS "validUntil", pc.active, pc.test_only AS "testOnly", pc.note, pc.created_at AS "createdAt",
         COUNT(DISTINCT sp.company_id) AS "companiesTried",
         COUNT(DISTINCT sp.company_id) FILTER (WHERE sp.status = 'succeeded') AS "companiesPaid",
         COUNT(sp.id) FILTER (WHERE sp.status = 'succeeded') AS "paymentsSucceeded",
         COALESCE(SUM(sp.amount_rub) FILTER (WHERE sp.status = 'succeeded'), 0) AS "paidRub",
         COALESCE(SUM(sp.discount_rub) FILTER (WHERE sp.status = 'succeeded'), 0) AS "discountRub"
  FROM promo_codes pc
  LEFT JOIN subscription_payments sp ON sp.promo_code_id = pc.id
`;

function toNumbers(row) {
  return {
    ...row,
    companiesTried: Number(row.companiesTried),
    companiesPaid: Number(row.companiesPaid),
    paymentsSucceeded: Number(row.paymentsSucceeded),
    paidRub: Number(row.paidRub),
    discountRub: Number(row.discountRub),
  };
}

// Общая проверка полей для создания и правки — undefined = поле не передано
// (при правке не трогаем), null/'' = снять ограничение.
function parseLimits(body) {
  const out = {};
  if (body.maxRedemptions !== undefined) {
    if (body.maxRedemptions === null || body.maxRedemptions === '') out.maxRedemptions = null;
    else {
      const n = Number(body.maxRedemptions);
      if (!Number.isInteger(n) || n <= 0) throw Object.assign(new Error('Лимит — целое число больше 0 или пусто'), { status: 400 });
      out.maxRedemptions = n;
    }
  }
  if (body.validUntil !== undefined) {
    if (body.validUntil === null || body.validUntil === '') out.validUntil = null;
    else {
      // Дата из поля type="date" — действует до конца этого дня по Москве.
      const d = new Date(`${body.validUntil}T23:59:59+03:00`);
      if (Number.isNaN(d.getTime())) throw Object.assign(new Error('Неверная дата окончания'), { status: 400 });
      out.validUntil = d;
    }
  }
  return out;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`${SELECT_WITH_STATS} GROUP BY pc.id ORDER BY pc.created_at DESC`);
    res.json({ enabledForAll: process.env.PROMO_CODES_ENABLED === 'true', codes: rows.map(toNumbers) });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const code = normalizeCode(req.body?.code);
    if (!isValidCodeFormat(code)) {
      return res.status(400).json({ error: 'Код: 3–32 символа, буквы, цифры, «-» или «_»' });
    }
    const appliesTo = req.body?.appliesTo;
    if (appliesTo !== 'report' && appliesTo !== 'subscription') {
      return res.status(400).json({ error: 'Выберите, на что действует код' });
    }
    const discountType = req.body?.discountType;
    if (discountType !== 'percent' && discountType !== 'fixed') {
      return res.status(400).json({ error: 'Выберите тип скидки' });
    }
    const discountValue = Number(req.body?.discountValue);
    if (!Number.isInteger(discountValue) || discountValue <= 0) {
      return res.status(400).json({ error: 'Размер скидки — целое число больше 0' });
    }
    if (discountType === 'percent' && discountValue > 99) {
      return res.status(400).json({ error: 'Скидка не больше 99% — бесплатный период делается отдельно' });
    }
    // Цена подписки — SUBSCRIPTION_PRICE_RUB в subscription.routes.js; при её
    // смене поправить и здесь. Без этой проверки скидка 5000 ₽ молча
    // превращала бы первый платёж в 1 ₽ (минимум ЮKassa, core/promoCodes.js).
    if (discountType === 'fixed' && discountValue >= 1990) {
      return res.status(400).json({ error: 'Скидка в рублях должна быть меньше цены (1990 ₽)' });
    }
    let limits;
    try {
      limits = parseLimits(req.body || {});
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO promo_codes (code, discount_type, discount_value, applies_to, max_redemptions, valid_until, note, test_only)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [code, discountType, discountValue, appliesTo, limits.maxRedemptions ?? null, limits.validUntil ?? null, req.body?.note?.trim() || null, !!req.body?.testOnly]
      );
      res.status(201).json({ id: rows[0].id });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Такой код уже есть' });
      throw err;
    }
  })
);

// Правка: включить/выключить, лимит, срок, заметка. Размер скидки и сам код
// не меняются — по ним уже могли заплатить; нужна другая скидка — новый код.
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    let limits;
    try {
      limits = parseLimits(req.body || {});
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    const sets = [];
    const params = [req.params.id];
    if (typeof req.body?.active === 'boolean') {
      params.push(req.body.active);
      sets.push(`active = $${params.length}`);
    }
    if (typeof req.body?.testOnly === 'boolean') {
      params.push(req.body.testOnly);
      sets.push(`test_only = $${params.length}`);
    }
    if ('maxRedemptions' in limits) {
      params.push(limits.maxRedemptions);
      sets.push(`max_redemptions = $${params.length}`);
    }
    if ('validUntil' in limits) {
      params.push(limits.validUntil);
      sets.push(`valid_until = $${params.length}`);
    }
    if (req.body?.note !== undefined) {
      params.push(req.body.note?.trim() || null);
      sets.push(`note = $${params.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Нечего менять' });

    const { rowCount } = await pool.query(`UPDATE promo_codes SET ${sets.join(', ')} WHERE id = $1`, params);
    if (rowCount === 0) return res.status(404).json({ error: 'Код не найден' });
    res.json({ ok: true });
  })
);

// Кто пробовал оплатить с этим кодом — для отчёта по коду.
router.get(
  '/:id/payments',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT sp.id, c.id AS "companyId", c.name AS "companyName", c.is_test AS "isTest", sp.amount_rub AS "amountRub",
              sp.discount_rub AS "discountRub", sp.status, sp.created_at AS "createdAt"
       FROM subscription_payments sp JOIN companies c ON c.id = sp.company_id
       WHERE sp.promo_code_id = $1
       ORDER BY sp.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  })
);

module.exports = router;
