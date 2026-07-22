const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { signBaseToken, signCompanyToken, verifyToken } = require('../core/jwt');
const { studioOsBundleKeys } = require('../core/modules-registry');
const { logEvent } = require('../core/eventLog');
const { logAudit } = require('../core/auditLog');
const { uploadPhoto } = require('../core/uploads');
const { saveImage, getFileUrl } = require('../core/fileStorage');
const { checkLoginAllowed, recordFailedLogin } = require('../core/loginRateLimit');

const router = express.Router();

async function activeMembershipsForUser(userId) {
  const { rows } = await pool.query(
    `SELECT m.id AS membership_id, m.role, m.branch_id, c.id AS company_id, c.name AS company_name
     FROM memberships m
     JOIN companies c ON c.id = m.company_id
     WHERE m.user_id = $1 AND m.invite_status = 'active'
     ORDER BY c.name`,
    [userId]
  );
  return rows.map((r) => ({
    companyId: r.company_id,
    companyName: r.company_name,
    membershipId: r.membership_id,
    role: r.role,
    branchId: r.branch_id,
  }));
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, password, companyName, industrySegment } = req.body;
    if (!name || !email || !password || !companyName) {
      return res.status(400).json({ error: 'Заполните имя, email, пароль и название компании' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Пароль должен быть не короче 8 символов' });
    }

    const existing = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Пользователь с таким email уже зарегистрирован' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const client = await pool.connect();
    let user;
    let company;
    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, phone, is_super_admin, onboarding_seen_at',
        [name, email, passwordHash]
      );
      user = userResult.rows[0];

      const companyResult = await client.query(
        `INSERT INTO companies (name, industry_segment, created_by_user_id, trial_ends_at)
         VALUES ($1, $2, $3, now() + interval '30 days')
         RETURNING id, name`,
        [companyName, industrySegment || null, user.id]
      );
      company = companyResult.rows[0];

      const membershipResult = await client.query(
        `INSERT INTO memberships (user_id, company_id, role, invite_status)
         VALUES ($1, $2, 'owner', 'active') RETURNING id, role, branch_id`,
        [user.id, company.id]
      );
      const membership = membershipResult.rows[0];

      for (const moduleKey of studioOsBundleKeys()) {
        await client.query(
          `INSERT INTO company_modules (company_id, module_key, enabled) VALUES ($1, $2, true)
           ON CONFLICT (company_id, module_key) DO NOTHING`,
          [company.id, moduleKey]
        );
      }

      await client.query('COMMIT');

      await logEvent({
        companyId: company.id,
        moduleKey: 'platform',
        userId: user.id,
        entityType: 'company',
        entityId: company.id,
        action: 'company.registered',
      });
      await logAudit({
        companyId: company.id,
        userId: user.id,
        action: 'company.registered',
        entityType: 'company',
        entityId: company.id,
      });

      res.status(201).json({
        token: signBaseToken(user.id),
        user,
        companies: [
          {
            companyId: company.id,
            companyName: company.name,
            membershipId: membership.id,
            role: membership.role,
            branchId: membership.branch_id,
          },
        ],
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Введите email и пароль' });
    }

    // Этап 9: ограничение попыток входа — проверяем ДО обращения к
    // паролю, чтобы сам перебор (даже без правильного email) считался.
    const allowed = await checkLoginAllowed(req.ip, email);
    // Временная диагностика (docs/bug-login-401.txt) — не логируем пароль,
    // только факт срабатывания rate-limit. Убрать после подтверждения причины.
    console.log('[login-debug] попытка входа, email =', email, 'rate-limit allowed =', allowed);
    if (!allowed) {
      return res.status(429).json({ error: 'Слишком много попыток входа. Попробуйте снова через 15 минут.' });
    }

    const result = await pool.query(
      'SELECT id, name, email, phone, is_super_admin, analytics_consent, avatar_url, onboarding_seen_at, password_hash FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];
    console.log('[login-debug] пользователь найден по email =', !!user, user ? `id=${user.id}` : '');
    if (!user) {
      await recordFailedLogin(req.ip, email);
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    console.log('[login-debug] совпадение пароля =', valid, 'hash начинается с =', user.password_hash?.slice(0, 7));
    if (!valid) {
      await recordFailedLogin(req.ip, email);
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    delete user.password_hash;
    const companies = await activeMembershipsForUser(user.id);

    res.json({ token: signBaseToken(user.id), user, companies });
  })
);

router.post(
  '/select-company',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { companyId } = req.body;
    if (!companyId) {
      return res.status(400).json({ error: 'Не указана компания' });
    }

    const { rows } = await pool.query(
      `SELECT m.id AS membership_id, m.role, m.branch_id, c.id AS company_id, c.name AS company_name
       FROM memberships m
       JOIN companies c ON c.id = m.company_id
       WHERE m.user_id = $1 AND m.company_id = $2 AND m.invite_status = 'active'`,
      [req.user.id, companyId]
    );
    const membership = rows[0];
    if (!membership) {
      return res.status(403).json({ error: 'Нет доступа к этой компании' });
    }

    const token = signCompanyToken({
      userId: req.user.id,
      companyId: membership.company_id,
      membershipId: membership.membership_id,
      role: membership.role,
      branchId: membership.branch_id,
    });

    res.json({
      token,
      company: { id: membership.company_id, name: membership.company_name },
      role: membership.role,
      branchId: membership.branch_id,
    });
  })
);

router.get(
  '/invite/:token',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT m.role, m.invited_email, c.name AS company_name
       FROM memberships m
       JOIN companies c ON c.id = m.company_id
       WHERE m.invite_token = $1 AND m.invite_status = 'pending'`,
      [req.params.token]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Приглашение не найдено или уже использовано' });
    }
    const invite = rows[0];
    res.json({ role: invite.role, invitedEmail: invite.invited_email, companyName: invite.company_name });
  })
);

router.post(
  '/accept-invite',
  asyncHandler(async (req, res) => {
    const { token, name, email, password, acceptedTerms, analyticsConsent } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Не указан код приглашения' });
    }

    const invite = await pool.query(
      `SELECT id, company_id, role FROM memberships WHERE invite_token = $1 AND invite_status = 'pending'`,
      [token]
    );
    if (invite.rows.length === 0) {
      return res.status(404).json({ error: 'Приглашение не найдено или уже использовано' });
    }
    const membership = invite.rows[0];

    let userId;
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      try {
        userId = verifyToken(header.slice('Bearer '.length)).sub;
      } catch (err) {
        return res.status(401).json({ error: 'Недействительный или истёкший токен' });
      }
    } else {
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Заполните имя, email и пароль, либо войдите в существующий аккаунт' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Пароль должен быть не короче 8 символов' });
      }
      if (!acceptedTerms) {
        return res.status(400).json({ error: 'Нужно принять условия оферты и политики конфиденциальности' });
      }
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Пользователь с таким email уже зарегистрирован — войдите в аккаунт и повторите переход по ссылке' });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const created = await pool.query(
        `INSERT INTO users (name, email, password_hash, accepted_terms_at, analytics_consent)
         VALUES ($1, $2, $3, now(), $4) RETURNING id`,
        [name, email, passwordHash, !!analyticsConsent]
      );
      userId = created.rows[0].id;
    }

    const dup = await pool.query(
      `SELECT 1 FROM memberships WHERE user_id = $1 AND company_id = $2 AND invite_status = 'active'`,
      [userId, membership.company_id]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'Вы уже состоите в этой компании' });
    }

    await pool.query(
      `UPDATE memberships SET user_id = $1, invite_status = 'active', invite_token = NULL WHERE id = $2`,
      [userId, membership.id]
    );

    await logEvent({
      companyId: membership.company_id,
      moduleKey: 'platform',
      userId,
      entityType: 'membership',
      entityId: membership.id,
      action: 'membership.accepted',
    });
    await logAudit({
      companyId: membership.company_id,
      userId,
      action: 'membership.accepted',
      entityType: 'membership',
      entityId: membership.id,
    });

    const userResult = await pool.query(
      'SELECT id, name, email, phone, is_super_admin, analytics_consent, avatar_url, onboarding_seen_at FROM users WHERE id = $1',
      [userId]
    );

    res.json({ token: signBaseToken(userId), user: userResult.rows[0], companyId: membership.company_id });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const companies = await activeMembershipsForUser(req.user.id);
    const tenant =
      req.authSession.session === 'company'
        ? {
            companyId: req.authSession.companyId,
            role: req.authSession.role,
            branchId: req.authSession.branchId,
          }
        : null;

    res.json({ user: req.user, companies, tenant });
  })
);

// analyticsConsent — согласие на использование обезличенных агрегированных
// данных для аналитики, можно отозвать в любой момент через настройки
// (политика конфиденциальности, п.10.3). onboardingSeen — Этап 11:
// отмечает вступительную инструкцию прочитанной, показывается один раз.
router.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { analyticsConsent, onboardingSeen } = req.body;
    if (analyticsConsent === undefined && onboardingSeen === undefined) {
      return res.status(400).json({ error: 'Нечего обновлять' });
    }
    if (analyticsConsent !== undefined) {
      await pool.query('UPDATE users SET analytics_consent = $1 WHERE id = $2', [!!analyticsConsent, req.user.id]);
    }
    if (onboardingSeen) {
      await pool.query('UPDATE users SET onboarding_seen_at = now() WHERE id = $1', [req.user.id]);
    }
    res.json({
      analyticsConsent: analyticsConsent !== undefined ? !!analyticsConsent : undefined,
      onboardingSeenAt: onboardingSeen ? new Date().toISOString() : undefined,
    });
  })
);

// Этап 7: фото пользователя/лого компании в круге личного кабинета —
// загружается тем же механизмом, что и фото визита (core/fileStorage.js),
// просто в отдельное поле users.avatar_url.
router.post(
  '/me/avatar',
  requireAuth,
  uploadPhoto,
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const filename = await saveImage(req.file.buffer);
    const url = getFileUrl(filename);
    await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [url, req.user.id]);
    res.status(201).json({ avatarUrl: url });
  })
);

module.exports = router;
