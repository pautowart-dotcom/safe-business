const pool = require('../db/pool');
const { normalizeCode, isValidCodeFormat } = require('./promoCodes');

// Те же числа, что на странице /partner/ и в кабинете (ответ /partner/me).
const SHARE_PERCENT = 30;
const HOLD_DAYS = 14;
const PAYOUT_MIN_RUB = 2000;

function cleanVisitorKey(raw) {
  if (typeof raw !== 'string') return '';
  const key = raw.trim();
  return /^[a-zA-Z0-9]{8,64}$/.test(key) ? key : '';
}

function discountPercentOf(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > SHARE_PERCENT) return null;
  return n;
}

// Список минус скидка партнёра. Доля сервиса — всегда 70% списка.
// Если цену уже снизил другой промокод, paidRub — сумма к оплате, доля
// партнёра не уходит в минус.
function partnerSplit(listRub, discountPercent, paidRub) {
  const list = Number(listRub);
  const pool = Math.round((list * SHARE_PERCENT) / 100);
  const pct = discountPercentOf(discountPercent) ?? 0;
  const fromPartner = Math.min(pool, Math.round((list * pct) / 100));
  const payRub = paidRub == null ? list - fromPartner : Number(paidRub);
  const given = Math.max(0, list - payRub);
  return {
    payRub,
    discountRub: list - payRub,
    shareRub: Math.max(0, pool - given),
  };
}

async function findPartnerByCode(raw) {
  const code = normalizeCode(raw);
  if (!code || !isValidCodeFormat(code)) return null;
  const { rows } = await pool.query(
    'SELECT id, user_id, code, discount_percent FROM partner_profiles WHERE code = $1',
    [code]
  );
  return rows[0] || null;
}

// Своя оплата долю не даёт: ни свой пользователь, ни тот же email
// (гость теста указывает почту уже на оплате).
async function partnerOfferForCheckout({ code, userId, email }) {
  const partner = await findPartnerByCode(code);
  if (!partner || partner.user_id === userId) return null;
  if (email) {
    const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [partner.user_id]);
    if (rows[0]?.email && rows[0].email.toLowerCase() === String(email).toLowerCase()) return null;
  }
  return { id: partner.id, discountPercent: partner.discount_percent };
}

async function accrue({ partnerProfileId, companyId, source, sourceId, amountRub, shareRub }) {
  if (!partnerProfileId || !sourceId || !amountRub || shareRub == null || shareRub < 0) return;
  const { rows: partners } = await pool.query(
    'SELECT user_id FROM partner_profiles WHERE id = $1',
    [partnerProfileId]
  );
  if (!partners[0]) return;
  const { rows: owners } = await pool.query(
    `SELECT user_id FROM memberships
     WHERE company_id = $1 AND role = 'owner' AND invite_status = 'active'`,
    [companyId]
  );
  if (owners.some((row) => row.user_id === partners[0].user_id)) return;
  await pool.query(
    `INSERT INTO partner_accruals
       (partner_id, company_id, source, source_id, amount_rub, share_rub, hold_until)
     VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(days => $7::int))
     ON CONFLICT (source, source_id) DO NOTHING`,
    [partnerProfileId, companyId, source, sourceId, amountRub, shareRub, HOLD_DAYS]
  );
}

async function accrueSubscriptionPayment(yookassaPaymentId) {
  const { rows } = await pool.query(
    `SELECT id, company_id, amount_rub, report_id, partner_profile_id, partner_share_rub
     FROM subscription_payments WHERE yookassa_payment_id = $1`,
    [yookassaPaymentId]
  );
  const payment = rows[0];
  // Подписка (report_id пустой) долю не даёт. Разовое заключение — да.
  if (!payment?.partner_profile_id || !payment.report_id) return;
  await accrue({
    partnerProfileId: payment.partner_profile_id,
    companyId: payment.company_id,
    source: 'report',
    sourceId: payment.id,
    amountRub: payment.amount_rub,
    shareRub: payment.partner_share_rub,
  });
}

async function accrueAddonPayment(yookassaPaymentId) {
  const { rows } = await pool.query(
    `SELECT id, company_id, addon_key, amount_rub, report_id, partner_profile_id, partner_share_rub
     FROM addon_purchases WHERE yookassa_payment_id = $1`,
    [yookassaPaymentId]
  );
  const payment = rows[0];
  if (!payment?.partner_profile_id || payment.addon_key !== 'document_templates') return;
  await accrue({
    partnerProfileId: payment.partner_profile_id,
    companyId: payment.company_id,
    source: payment.report_id ? 'bundle' : 'templates',
    sourceId: payment.id,
    amountRub: payment.amount_rub,
    shareRub: payment.partner_share_rub,
  });
}

const EXAMPLE_PRICES = [
  ['Заключение', 1990],
  ['Документы', 4990],
  ['Оба вместе', 5990],
];

function examplesFor(discountPercent) {
  return EXAMPLE_PRICES.map(([label, listRub]) => {
    const split = partnerSplit(listRub, discountPercent);
    return { label, listRub, payRub: split.payRub, shareRub: split.shareRub };
  });
}

async function statsForUser(userId) {
  const { rows } = await pool.query(
    'SELECT id, code, discount_percent, legal_status, inn, legal_name, phone, payout_details FROM partner_profiles WHERE user_id = $1',
    [userId]
  );
  const profile = rows[0];
  const discountPercent = profile ? profile.discount_percent : 0;
  const base = {
    code: profile ? profile.code : null,
    discountPercent,
    legalStatus: profile ? profile.legal_status : null,
    inn: profile ? profile.inn : null,
    legalName: profile ? profile.legal_name : null,
    phone: profile ? profile.phone : null,
    payoutDetails: profile ? profile.payout_details : null,
    examples: examplesFor(discountPercent),
    sharePercent: SHARE_PERCENT,
    holdDays: HOLD_DAYS,
    payoutMinRub: PAYOUT_MIN_RUB,
  };
  if (!profile) {
    return { ...base, arrived: 0, payments: 0, earnedRub: 0, readyRub: 0 };
  }
  const { rows: totals } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM partner_visits WHERE partner_id = $1)::int AS arrived,
       (SELECT COUNT(*) FROM partner_accruals WHERE partner_id = $1 AND status <> 'void')::int AS payments,
       (SELECT COALESCE(SUM(share_rub), 0) FROM partner_accruals WHERE partner_id = $1 AND status <> 'void')::int AS earned,
       (SELECT COALESCE(SUM(share_rub), 0) FROM partner_accruals
         WHERE partner_id = $1 AND status = 'hold' AND hold_until <= now())::int AS ready`,
    [profile.id]
  );
  return {
    ...base,
    arrived: totals[0].arrived,
    payments: totals[0].payments,
    earnedRub: totals[0].earned,
    readyRub: totals[0].ready,
  };
}

async function setCode(userId, raw, discountRaw) {
  const code = normalizeCode(raw);
  if (!isValidCodeFormat(code)) {
    const err = new Error('Код: от 3 до 32 букв и цифр, можно дефис и подчёркивание');
    err.status = 400;
    throw err;
  }
  const discountPercent = discountPercentOf(discountRaw);
  if (discountPercent == null) {
    const err = new Error('Скидка — целое число от 0 до 30');
    err.status = 400;
    throw err;
  }
  const promo = await pool.query('SELECT 1 FROM promo_codes WHERE code = $1', [code]);
  if (promo.rows.length > 0) {
    const err = new Error('Этот код уже занят');
    err.status = 400;
    throw err;
  }
  const taken = await pool.query('SELECT user_id FROM partner_profiles WHERE code = $1', [code]);
  if (taken.rows[0] && taken.rows[0].user_id !== userId) {
    const err = new Error('Этот код уже занят');
    err.status = 400;
    throw err;
  }
  try {
    await pool.query(
      `INSERT INTO partner_profiles (user_id, code, discount_percent)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET code = EXCLUDED.code, discount_percent = EXCLUDED.discount_percent, updated_at = now()`,
      [userId, code, discountPercent]
    );
  } catch (err) {
    if (err.code === '23505') {
      const busy = new Error('Этот код уже занят');
      busy.status = 400;
      throw busy;
    }
    throw err;
  }
  return statsForUser(userId);
}

async function recordVisit(rawCode, rawVisitor) {
  const partner = await findPartnerByCode(rawCode);
  const visitorKey = cleanVisitorKey(rawVisitor);
  if (!partner || !visitorKey) return;
  await pool.query(
    `INSERT INTO partner_visits (partner_id, visitor_key) VALUES ($1, $2)
     ON CONFLICT (partner_id, visitor_key) DO NOTHING`,
    [partner.id, visitorKey]
  );
}

module.exports = {
  SHARE_PERCENT,
  HOLD_DAYS,
  PAYOUT_MIN_RUB,
  findPartnerByCode,
  partnerOfferForCheckout,
  partnerSplit,
  accrueSubscriptionPayment,
  accrueAddonPayment,
  statsForUser,
  setCode,
  recordVisit,
};
