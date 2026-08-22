// Публичная форма приёма заявок без входа в систему (20.08.2026) — первый
// повод: клининг, владелица хочет вставить ссылку в шапку Instagram/автоответ
// WhatsApp, чтобы заявки попадали в "Заявки" сами, а не только вручную.
// Смешивает в одном файле авторизованный роут (получить/сгенерировать свою
// ссылку) и публичный (принять заявку по токену) — тот же приём, что уже
// используется в generated-journals.routes.js (создание журнала — свой
// роут, verify/:token — публичный, в одном файле).
const crypto = require('crypto');
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireModule } = require('../core/sdk');
const { checkLoginAllowed, recordFailedLogin } = require('../core/loginRateLimit');

const router = express.Router();

const CLIENT_TYPES = ['individual', 'legal_entity'];
// Ровно 10 цифр после кода страны (российский мобильный/городской номер без
// +7/8) — маска на фронте (PublicLeadForm.jsx) уже приводит ввод к этому
// виду, но публичный роут без авторизации нельзя валидировать только на
// клиенте (тривиально обойти прямым запросом), поэтому проверяем и здесь.
const PHONE_DIGITS_RE = /^\d{10}$/;

router.get(
  '/token',
  requireAuth,
  requireTenant,
  requireModule('leads'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT leads_public_token FROM companies WHERE id = $1', [req.tenant.companyId]);
    let token = rows[0]?.leads_public_token;
    if (!token) {
      token = crypto.randomBytes(16).toString('hex');
      await pool.query('UPDATE companies SET leads_public_token = $1 WHERE id = $2', [token, req.tenant.companyId]);
    }
    res.json({ token });
  })
);

// Публичный POST — без авторизации. Токен непредсказуем, отдельной капчи не
// нужно, но лимитируем по IP+токену переиспользуя login_attempts (тот же
// смысл — "не больше N попыток за 15 минут с одного адреса на одну цель",
// не только логин), чтобы скрипт не мог засыпать один список заявок мусором.
router.post(
  '/:token',
  asyncHandler(async (req, res) => {
    const allowed = await checkLoginAllowed(req.ip, `leads-public:${req.params.token}`);
    if (!allowed) {
      return res.status(429).json({ error: 'Слишком много заявок с этого адреса — попробуйте позже' });
    }

    const { name, phone, clientType, comment, personalDataConsent } = req.body;
    if (!name || !name.trim()) {
      await recordFailedLogin(req.ip, `leads-public:${req.params.token}`);
      return res.status(400).json({ error: 'Укажите имя или название' });
    }
    if (clientType && !CLIENT_TYPES.includes(clientType)) {
      await recordFailedLogin(req.ip, `leads-public:${req.params.token}`);
      return res.status(400).json({ error: 'Некорректный тип клиента' });
    }
    // Телефон необязателен (как и раньше — человек мог оставить только имя
    // и комментарий), но если указан — должен быть похож на настоящий
    // номер, а не произвольный текст/цифры (маска на фронте уже приводит
    // к 10 цифрам, здесь просто перепроверяем то же самое).
    const phoneDigits = phone ? phone.replace(/\D/g, '').replace(/^7|^8/, '') : '';
    if (phone && !PHONE_DIGITS_RE.test(phoneDigits)) {
      await recordFailedLogin(req.ip, `leads-public:${req.params.token}`);
      return res.status(400).json({ error: 'Некорректный номер телефона' });
    }
    if (!personalDataConsent) {
      await recordFailedLogin(req.ip, `leads-public:${req.params.token}`);
      return res.status(400).json({ error: 'Нужно согласие на обработку персональных данных' });
    }

    const company = await pool.query(
      `SELECT c.id FROM companies c
       JOIN company_modules cm ON cm.company_id = c.id AND cm.module_key = 'leads' AND cm.enabled = true
       WHERE c.leads_public_token = $1`,
      [req.params.token]
    );
    await recordFailedLogin(req.ip, `leads-public:${req.params.token}`);
    if (company.rows.length === 0) {
      return res.status(404).json({ error: 'Ссылка недействительна' });
    }

    await pool.query(
      `INSERT INTO sales_leads (company_id, name, phone, client_type, comment, personal_data_consent_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [company.rows[0].id, name.trim(), phone ? `+7${phoneDigits}` : null, clientType || 'individual', comment || null]
    );
    res.status(201).json({ ok: true });
  })
);

module.exports = router;
