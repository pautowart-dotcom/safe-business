const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { signBaseToken, signCompanyToken, verifyToken } = require('../core/jwt');
const { studioOsBundleKeys } = require('../core/modules-registry');
const { logEvent } = require('../core/eventLog');
const { logAudit } = require('../core/auditLog');
const { uploadPhoto } = require('../core/uploads');
const { saveImage, getFileUrl, signAvatarUrl } = require('../core/fileStorage');
const { checkLoginAllowed, recordFailedLogin } = require('../core/loginRateLimit');
const { sendMail } = require('../core/mailer');
const { sendPushToSuperAdmins } = require('../core/pushNotify');

const router = express.Router();

const VERIFICATION_CODE_TTL_MINUTES = 10;

// Общий механизм для двух разных поводов ("подтвердите email при
// регистрации" и "подтвердите новое устройство при входе") — оба сводятся
// к одному и тому же: доказать владение почтой одноразовым кодом. Код
// хранится хэшем, как пароль (см. password_reset_tokens — та же логика).
async function sendVerificationCode(userId, email) {
  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60 * 1000);
  await pool.query(
    'INSERT INTO login_verification_codes (user_id, code_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, codeHash, expiresAt]
  );
  await sendMail({
    to: email,
    subject: 'Код подтверждения — «Безопасный бизнес»',
    html: `<p>Код: <b style="font-size:20px">${code}</b></p><p>Действует ${VERIFICATION_CODE_TTL_MINUTES} минут. Если это были не вы — просто проигнорируйте письмо.</p>`,
  });
}

// Общая развязка для /register и /login: устройство уже подтверждено
// (deviceToken совпал с сохранённым хэшем) — пускаем сразу, иначе просим
// код с почты. Регистрация вызывает это без deviceToken вообще, поэтому
// первый вход после регистрации гарантированно требует код — отдельного
// "подтвердите email" механизма не нужно, это тот же самый случай
// "устройство ещё не подтверждено".
async function loginOrRequireVerification(res, user, deviceToken, status = 200) {
  // До 06.08.2026 супер-админ был исключением — код с почты не требовался
  // вовсе (аргумент был "у него и так root на сервере/БД"). Это защищало
  // от взлома сервера, но не от угадывания/утечки одного только пароля —
  // а это единственный аккаунт, который может всё. По просьбе владельца
  // (максимальная защита) супер-админ теперь проходит ту же проверку
  // устройства, что и все, — admin-frontend получил свой экран ввода кода
  // (см. admin-frontend/src/pages/Login.jsx).
  let deviceTrusted = false;
  if (deviceToken) {
    const tokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');
    const deviceRes = await pool.query(
      'SELECT id FROM trusted_devices WHERE user_id = $1 AND device_token_hash = $2',
      [user.id, tokenHash]
    );
    if (deviceRes.rows.length > 0) {
      deviceTrusted = true;
      await pool.query('UPDATE trusted_devices SET last_used_at = now() WHERE id = $1', [deviceRes.rows[0].id]);
    }
  }

  if (!deviceTrusted) {
    await sendVerificationCode(user.id, user.email);
    return res.status(status).json({ requiresDeviceVerification: true, email: user.email });
  }

  delete user.password_hash;
  // Аудит безопасности 29.07.2026 подписал ссылки на визитные фото/документы,
  // но не тронул аватар (тогда решили — низкая чувствительность) — а роут
  // раздачи /api/uploads стал требовать подпись у ЛЮБОГО файла без
  // исключений. С тех пор аватар отдавался неподписанной ссылкой, которую
  // сервер сам же отклонял: битая картинка вместо фото в личном кабинете.
  if (user.avatar_url) user.avatar_url = signAvatarUrl(user.avatar_url);
  const companies = await activeMembershipsForUser(user.id);
  return res.status(status).json({ token: signBaseToken(user.id), user, companies });
}

async function activeMembershipsForUser(userId) {
  const { rows } = await pool.query(
    `SELECT m.id AS membership_id, m.role, m.branch_id, c.id AS company_id, c.name AS company_name
     FROM memberships m
     JOIN companies c ON c.id = m.company_id
     WHERE m.user_id = $1 AND m.invite_status = 'active' AND m.active = true
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
    const { name, email, password, companyName, industrySegment, acceptedTerms, analyticsConsent } = req.body;
    if (!name || !email || !password || !companyName) {
      return res.status(400).json({ error: 'Заполните имя, email, пароль и название компании' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Пароль должен быть не короче 8 символов' });
    }
    // Раньше самостоятельная регистрация (в отличие от accept-invite) не
    // требовала принять оферту/политику — пробел, раз это единственный
    // публичный путь завести аккаунт (лендинг → регистрация).
    if (!acceptedTerms) {
      return res.status(400).json({ error: 'Нужно принять условия оферты и политики конфиденциальности' });
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
        `INSERT INTO users (name, email, password_hash, accepted_terms_at, analytics_consent)
         VALUES ($1, $2, $3, now(), $4) RETURNING id, name, email, phone, is_super_admin, onboarding_seen_at`,
        [name, email, passwordHash, !!analyticsConsent]
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

      // Владелец решил (31.07.2026): "Клиенты"/"Визиты" — тоже сразу включены
      // новым компаниям, а не только по ручному включению. Модули остаются
      // переключаемыми (toggleable: true) — можно выключить в любой момент
      // через POST /modules/:key/disable, поэтому здесь просто добавлены к
      // общему списку по умолчанию, а не переведены в studioOsBundleKeys().
      for (const moduleKey of [...studioOsBundleKeys(), 'clients', 'visits']) {
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

      // Push владельцу платформы (обсуждение 09.08.2026) — fire-and-forget,
      // не должен задерживать/ронять ответ регистрации, если push упадёт.
      sendPushToSuperAdmins({
        title: 'Новая регистрация',
        body: `${companyName} — ${email}`,
        url: '/office/companies',
      }).catch((err) => console.error('sendPushToSuperAdmins (registration) failed:', err));

      // Аккаунт уже создан и рабочий на этом этапе — код ниже не отменяет
      // регистрацию, если письмо не уйдёт (см. loginOrRequireVerification),
      // просто без кода войти не получится, пока не запросят его заново
      // через обычный вход (тот же механизм).
      await loginOrRequireVerification(res, user, undefined, 201);
      return;
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
    const { email, password, deviceToken } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Введите email и пароль' });
    }

    // Этап 9: ограничение попыток входа — проверяем ДО обращения к
    // паролю, чтобы сам перебор (даже без правильного email) считался.
    const allowed = await checkLoginAllowed(req.ip, email);
    if (!allowed) {
      return res.status(429).json({ error: 'Слишком много попыток входа. Попробуйте снова через 15 минут.' });
    }

    const result = await pool.query(
      'SELECT id, name, email, phone, is_super_admin, analytics_consent, avatar_url, onboarding_seen_at, password_hash FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];
    if (!user) {
      await recordFailedLogin(req.ip, email);
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await recordFailedLogin(req.ip, email);
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    await loginOrRequireVerification(res, user, deviceToken);
  })
);

// Один и тот же код закрывает оба случая: подтверждение почты сразу после
// регистрации и подтверждение нового устройства при обычном входе — оба
// раза loginOrRequireVerification сохраняет код одинаково (login_verification_codes).
router.post(
  '/verify-code',
  asyncHandler(async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: 'Укажите email и код' });
    }

    const allowed = await checkLoginAllowed(req.ip, `verify:${email}`);
    if (!allowed) {
      return res.status(429).json({ error: 'Слишком много попыток. Попробуйте снова через 15 минут.' });
    }

    const userRes = await pool.query(
      'SELECT id, name, email, phone, is_super_admin, analytics_consent, avatar_url, onboarding_seen_at FROM users WHERE email = $1',
      [email]
    );
    const user = userRes.rows[0];
    if (!user) {
      await recordFailedLogin(req.ip, `verify:${email}`);
      return res.status(400).json({ error: 'Код неверный или истёк' });
    }

    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const codeRes = await pool.query(
      `SELECT id FROM login_verification_codes
       WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL AND expires_at > now()`,
      [user.id, codeHash]
    );
    if (codeRes.rows.length === 0) {
      await recordFailedLogin(req.ip, `verify:${email}`);
      return res.status(400).json({ error: 'Код неверный или истёк' });
    }
    await pool.query('UPDATE login_verification_codes SET used_at = now() WHERE id = $1', [codeRes.rows[0].id]);

    const deviceToken = crypto.randomBytes(32).toString('hex');
    const deviceTokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');
    await pool.query('INSERT INTO trusted_devices (user_id, device_token_hash) VALUES ($1, $2)', [user.id, deviceTokenHash]);

    const companies = await activeMembershipsForUser(user.id);
    res.json({ token: signBaseToken(user.id), user, companies, deviceToken });
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
       WHERE m.user_id = $1 AND m.company_id = $2 AND m.invite_status = 'active' AND m.active = true`,
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
      `SELECT id, company_id, role, branch_id, payout_percent FROM memberships WHERE invite_token = $1 AND invite_status = 'pending'`,
      [token]
    );
    if (invite.rows.length === 0) {
      return res.status(404).json({ error: 'Приглашение не найдено или уже использовано' });
    }
    const membership = invite.rows[0];

    let userId;
    // Явно переданные name+email+password означают "создать отдельный
    // аккаунт" — приоритет НАД заголовком Authorization. Раньше было
    // наоборот: если браузер уже залогинен кем-то другим (например, сам
    // владелец тестирует приглашение в своём же браузере), api-клиент всё
    // равно прикреплял его Authorization ко всем запросам, и форма "создать
    // отдельный аккаунт" молча игнорировалась — приглашённый всегда
    // присоединялся как уже залогиненный пользователь, с непонятной
    // ошибкой "вы уже состоите в этой компании".
    if (name && email && password) {
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
    } else {
      const header = req.headers.authorization;
      if (header && header.startsWith('Bearer ')) {
        try {
          userId = verifyToken(header.slice('Bearer '.length)).sub;
        } catch (err) {
          return res.status(401).json({ error: 'Недействительный или истёкший токен' });
        }
      } else {
        return res.status(400).json({ error: 'Заполните имя, email и пароль, либо войдите в существующий аккаунт' });
      }
    }

    // Раньше это был просто дубль-чек по invite_status — не учитывал
    // 0060_membership_deactivation.sql (увольнение = active=false, не
    // удаление строки). Из-за этого повторное приглашение уволенного на ту
    // же компанию либо блокировалось "вы уже состоите в этой компании" (его
    // старая неактивная запись всё ещё существует), либо упало бы на
    // уникальном индексе idx_memberships_user_company при попытке присвоить
    // user_id новой pending-записи — тот же (user_id, company_id) уже занят.
    // Раз старая запись уже есть — реактивируем именно её (id мог
    // фигурировать в визитах/выплатах), а новую pending-запись приглашения
    // удаляем вместо использования.
    const existingMembership = await pool.query(
      `SELECT id, active FROM memberships WHERE user_id = $1 AND company_id = $2`,
      [userId, membership.company_id]
    );

    let membershipId = membership.id;
    if (existingMembership.rows.length > 0) {
      const existing = existingMembership.rows[0];
      if (existing.active) {
        return res.status(409).json({ error: 'Вы уже состоите в этой компании' });
      }
      await pool.query(
        `UPDATE memberships SET role = $1, branch_id = $2, payout_percent = $3, active = true, invite_status = 'active', invite_token = NULL
         WHERE id = $4`,
        [membership.role, membership.branch_id, membership.payout_percent, existing.id]
      );
      await pool.query(`DELETE FROM memberships WHERE id = $1`, [membership.id]);
      membershipId = existing.id;
    } else {
      await pool.query(
        `UPDATE memberships SET user_id = $1, invite_status = 'active', invite_token = NULL WHERE id = $2`,
        [userId, membership.id]
      );
    }

    await logEvent({
      companyId: membership.company_id,
      moduleKey: 'platform',
      userId,
      entityType: 'membership',
      entityId: membershipId,
      action: 'membership.accepted',
    });
    await logAudit({
      companyId: membership.company_id,
      userId,
      action: 'membership.accepted',
      entityType: 'membership',
      entityId: membershipId,
    });

    const userResult = await pool.query(
      'SELECT id, name, email, phone, is_super_admin, analytics_consent, avatar_url, onboarding_seen_at FROM users WHERE id = $1',
      [userId]
    );
    const acceptedUser = userResult.rows[0];
    if (acceptedUser.avatar_url) acceptedUser.avatar_url = signAvatarUrl(acceptedUser.avatar_url);

    res.json({ token: signBaseToken(userId), user: acceptedUser, companyId: membership.company_id });
  })
);

const RESET_TOKEN_TTL_MINUTES = 60;

// Раньше забытый пароль не давал попасть в аккаунт никак — этой пары
// эндпоинтов не было вовсе.
router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Введите email' });
    }

    // Тот же механизм, что и у /login и /verify-code (core/loginRateLimit.js) —
    // без него запрос можно слать без ограничений: инструмент завалить чужой
    // ящик письмами о сбросе пароля или прощупывать зарегистрированные email
    // по времени ответа. Считаем сам факт запроса (не только "неудачу" —
    // здесь нет понятия неудачи, ответ всегда одинаковый), отдельным ключом
    // 'forgot:', чтобы не путать со счётчиком неудачных попыток входа.
    const allowed = await checkLoginAllowed(req.ip, `forgot:${email}`);
    if (!allowed) {
      return res.status(429).json({ error: 'Слишком много попыток. Попробуйте снова через 15 минут.' });
    }
    await recordFailedLogin(req.ip, `forgot:${email}`);

    // Один и тот же ответ независимо от того, найден email или нет —
    // иначе форма стала бы способом проверить чужие email на сервисе.
    const userRes = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userRes.rows.length > 0) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [userRes.rows[0].id, tokenHash, expiresAt]
      );
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;
      sendMail({
        to: email,
        subject: 'Восстановление пароля — «Безопасный бизнес»',
        html: `<p>Ссылка действует ${RESET_TOKEN_TTL_MINUTES} минут:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Если это были не вы — просто проигнорируйте письмо.</p>`,
      })
        .then(() => console.log('[mail] письмо о сбросе пароля отправлено на', email))
        .catch((err) => console.error('[mail] не удалось отправить письмо о сбросе пароля:', err.message));
    }
    res.json({ ok: true, message: 'Если такой email зарегистрирован, на него отправлена ссылка для восстановления' });
  })
);

router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Укажите токен и новый пароль' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Пароль должен быть не короче 8 символов' });
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenRes = await pool.query(
      `SELECT id, user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [tokenHash]
    );
    if (tokenRes.rows.length === 0) {
      return res.status(400).json({ error: 'Ссылка недействительна или истекла — запросите новую' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    // password_changed_at — старые выданные токены (действуют до 30 дней,
    // core/jwt.js) перестают приниматься сразу после смены пароля, а не
    // только когда истекут сами (core/middleware/auth.js сверяет с этим
    // полем). Аудит безопасности 29.07.2026.
    await pool.query('UPDATE users SET password_hash = $1, password_changed_at = now() WHERE id = $2', [passwordHash, tokenRes.rows[0].user_id]);
    await pool.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [tokenRes.rows[0].id]);
    res.json({ ok: true });
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
    // В БД остаётся голый путь (та же схема, что и у фото визитов) —
    // подписываем только на выходе клиенту, иначе подпись протухла бы
    // в БД навсегда.
    res.status(201).json({ avatarUrl: signAvatarUrl(url) });
  })
);

module.exports = router;
