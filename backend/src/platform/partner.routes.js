const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { createRateLimiter } = require('../core/rateLimit');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { loginOrRequireVerification } = require('./auth.routes');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { requireCaptcha } = require('../core/captcha');
const { checkLoginAllowed, recordFailedLogin } = require('../core/loginRateLimit');
const { isNewCohortNow, NEW_COHORT_MODULES } = require('../core/cohort');
const { studioOsBundleKeys } = require('../core/modules-registry');
const { ensureNicheModules } = require('../modules/security/nicheModules');
const { sendPushToSuperAdmins } = require('../core/pushNotify');
const { statsForUser, setCode, recordVisit } = require('../core/partnerProgram');

const STATUSES = ['self_employed', 'ip', 'ooo'];

const router = express.Router();

const visitLimit = createRateLimiter({ windowMs: 60 * 1000, max: 30 });

router.post(
  '/visit',
  visitLimit,
  asyncHandler(async (req, res) => {
    await recordVisit(req.body?.code, req.body?.visitorKey);
    res.status(201).json({ ok: true });
  })
);

router.get(
  '/me',
  requireAuth,
  requireTenant,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    res.json(await statsForUser(req.user.id));
  })
);

router.post(
  '/code',
  requireAuth,
  requireTenant,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    try {
      res.json(await setCode(req.user.id, req.body?.code, req.body?.discountPercent));
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  })
);

function normEmail(v) {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

router.post(
  '/register',
  requireCaptcha,
  asyncHandler(async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = normEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim().slice(0, 30) : '';
    const legalName = typeof req.body?.legalName === 'string' ? req.body.legalName.trim().slice(0, 200) : '';
    const inn = typeof req.body?.inn === 'string' ? req.body.inn.replace(/\D/g, '') : '';
    const legalStatus = STATUSES.includes(req.body?.legalStatus) ? req.body.legalStatus : '';
    if (!name || !email || !email.includes('@') || !phone || !legalName || !legalStatus) {
      return res.status(400).json({ error: 'Заполните имя, почту, телефон, статус и как к вам обращаться в выплате' });
    }
    if (password.length < 8) return res.status(400).json({ error: 'Пароль должен быть не короче 8 символов' });
    if (req.body?.legalStatus === 'person') {
      return res.status(400).json({ error: 'Физическое лицо без статуса самозанятого, ИП или организации в программе не участвует' });
    }
    if (!/^\d{10}$|^\d{12}$/.test(inn)) {
      return res.status(400).json({ error: 'Укажите ИНН: 10 цифр для организации или 12 для самозанятого и ИП' });
    }
    if (!req.body?.acceptedOffer || !req.body?.acceptedPrivacy) {
      return res.status(400).json({ error: 'Нужно отдельно принять оферту и политику партнёрской программы' });
    }
    const allowed = await checkLoginAllowed(req.ip, email);
    if (!allowed) return res.status(429).json({ error: 'Слишком много попыток. Попробуйте через 15 минут.' });
    await recordFailedLogin(req.ip, email);
    const existing = await pool.query('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Такая почта уже зарегистрирована — войдите' });

    const passwordHash = await bcrypt.hash(password, 10);
    const client = await pool.connect();
    let user;
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        `INSERT INTO users (name, email, password_hash, phone, accepted_terms_at, analytics_consent)
         VALUES ($1, $2, $3, $4, now(), $5)
         RETURNING id, name, email, phone, is_super_admin, onboarding_seen_at`,
        [name, email, passwordHash, phone, !!req.body?.analyticsConsent]
      );
      user = userResult.rows[0];
      const companyResult = await client.query(
        `INSERT INTO companies (name, industry_segment, signup_niche, created_by_user_id, trial_ends_at, ai_advisor_subscription_price_rub, opening_status)
         VALUES ($1, 'other', 'universal', $2, now() + interval '30 days', $3, 'open')
         RETURNING id`,
        [legalName, user.id, isNewCohortNow() ? 490 : 990]
      );
      const companyId = companyResult.rows[0].id;
      await client.query(
        `INSERT INTO memberships (user_id, company_id, role, invite_status) VALUES ($1, $2, 'owner', 'active')`,
        [user.id, companyId]
      );
      const modules = isNewCohortNow() ? NEW_COHORT_MODULES : [...studioOsBundleKeys(), 'clients', 'visits'];
      for (const moduleKey of modules) {
        await client.query(
          `INSERT INTO company_modules (company_id, module_key, enabled) VALUES ($1, $2, true)
           ON CONFLICT (company_id, module_key) DO NOTHING`,
          [companyId, moduleKey]
        );
      }
      await client.query(
        `INSERT INTO partner_profiles (user_id, code, legal_status, inn, legal_name, phone, terms_accepted_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())`,
        [user.id, `P${String(user.id).padStart(4, '0')}`, legalStatus, inn || null, legalName, phone]
      );
      await client.query('COMMIT');
      ensureNicheModules(companyId, ['universal']).catch(() => {});
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    sendPushToSuperAdmins({
      title: 'Новый партнёр',
      body: `${legalName} — ${email}`,
      url: '/office/partners',
    }).catch(() => {});
    await loginOrRequireVerification(res, user, undefined, 201);
  })
);

router.post(
  '/payout',
  requireAuth,
  requireTenant,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim().slice(0, 32) : '';
    const legalName = typeof req.body?.legalName === 'string' ? req.body.legalName.trim().slice(0, 200) : '';
    const inn = typeof req.body?.inn === 'string' ? req.body.inn.replace(/\D/g, '') : '';
    const payoutDetails = typeof req.body?.payoutDetails === 'string' ? req.body.payoutDetails.trim().slice(0, 500) : '';
    const legalStatus = STATUSES.includes(req.body?.legalStatus) ? req.body.legalStatus : '';
    if (req.body?.legalStatus === 'person') {
      return res.status(400).json({ error: 'Выплата физическому лицу без статуса самозанятого, ИП или организации не делается' });
    }
    if (!phone || !legalName || !legalStatus) return res.status(400).json({ error: 'Укажите телефон, имя для выплаты и статус' });
    if (!/^\d{10}$|^\d{12}$/.test(inn)) {
      return res.status(400).json({ error: 'Укажите ИНН: 10 или 12 цифр' });
    }
    const { rowCount } = await pool.query(
      `UPDATE partner_profiles
       SET phone = $2, legal_name = $3, inn = $4, payout_details = $5, legal_status = $6, updated_at = now()
       WHERE user_id = $1`,
      [req.user.id, phone, legalName, inn || null, payoutDetails || null, legalStatus]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Сначала зарегистрируйтесь как партнёр' });
    res.json(await statsForUser(req.user.id));
  })
);

module.exports = router;
