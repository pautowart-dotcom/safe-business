// Разовый аудит без регистрации (19.08.2026, п.5 плана) — публичная точка
// входа с лендинга: посетитель проходит сегментацию и тест без формы
// регистрации (имя/пароль), только email в момент оплаты. Технически это
// НЕ отдельный движок — за кулисами всё равно заводится обычная
// компания/пользователь/членство (та же схема, что /auth/register), просто
// автоматически, с плейсхолдер-почтой вместо формы; дальше фронт ведёт этот
// токен через ВСЕ уже существующие роуты модуля "Безопасность"
// (/modules/security/profile, /sessions, /sessions/:id/answers, /sessions/
// :id/report) без каких-либо изменений там — только этот файл новый.
// is_guest (миграция 0093) отличает такие записи для чек-аута/вебхука.
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { signCompanyToken } = require('../core/jwt');
const { studioOsBundleKeys } = require('../core/modules-registry');
const { isNewCohortNow, NEW_COHORT_MODULES } = require('../core/cohort');
const { checkLoginAllowed, recordFailedLogin } = require('../core/loginRateLimit');
const { sendMail } = require('../core/mailer');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');

const router = express.Router();

// Тихая обкатка (19.08.2026) — тот же приём, что у roadmap.routes.js
// (ROADMAP_PRODUCT_ENABLED): фича трогает деньги/почту/новые публичные
// аккаунты сразу при первом деплое, ещё не проверена вживую (нет живой БД
// в среде, где это писалось) — включить явно в .env, когда владелец
// проверит флоу целиком хотя бы один раз сам, прежде чем пускать
// реальных посетителей с лендинга.
router.use((req, res, next) => {
  if (process.env.ANONYMOUS_AUDIT_ENABLED === 'true') return next();
  res.status(404).json({ error: 'not_launched' });
});

// Ссылка "установить пароль" даёт гостю зайти на платформу под уже
// накопленными данными (тест уже пройден) — не срочный сброс пароля
// текущего пользователя (там TTL 60 минут, auth.routes.js), поэтому TTL
// намного дольше: гость может решить вернуться и через несколько дней.
const CLAIM_TOKEN_TTL_DAYS = 14;

// Реальной формы регистрации нет — риск спама компаний выше, чем у обычного
// /auth/register (там хотя бы email нужно ввести вручную). Переиспользуем
// готовый механизм login_attempts (core/loginRateLimit.js) — передаём IP
// вместо email в оба параметра, получаем ограничение по IP на более тесном
// из двух лимитов (5 попыток/15 минут).
router.post(
  '/start',
  asyncHandler(async (req, res) => {
    const allowed = await checkLoginAllowed(req.ip, req.ip);
    if (!allowed) {
      return res.status(429).json({ error: 'Слишком много попыток. Попробуйте снова через 15 минут.' });
    }
    await recordFailedLogin(req.ip, req.ip);

    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const guestEmail = `guest-${crypto.randomUUID()}@guest.business-safe.internal`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // accepted_terms_at НЕ проставляется здесь — гость ещё не видел ни
      // одного экрана с чекбоксом на оферту, аккаунт создаётся тихо в
      // фоне до какого-либо согласия. Ставится позже, при оплате
      // (checkout-one-time), там же, где по-настоящему нужно явное
      // согласие — см. комментарий там.
      const userResult = await client.query(
        `INSERT INTO users (name, email, password_hash, is_guest)
         VALUES ('Гость', $1, $2, true) RETURNING id`,
        [guestEmail, passwordHash]
      );
      const userId = userResult.rows[0].id;

      // ai_advisor_subscription_price_rub — та же логика когорты, что в
      // auth.routes.js: гость может позже поставить пароль и остаться
      // обычным клиентом, цена должна быть верной с самого начала.
      const companyResult = await client.query(
        `INSERT INTO companies (name, created_by_user_id, trial_ends_at, ai_advisor_subscription_price_rub)
         VALUES ('Моя компания', $1, now() + interval '30 days', $2) RETURNING id`,
        [userId, isNewCohortNow() ? 490 : 990]
      );
      const companyId = companyResult.rows[0].id;

      const membershipResult = await client.query(
        `INSERT INTO memberships (user_id, company_id, role, invite_status)
         VALUES ($1, $2, 'owner', 'active') RETURNING id, role`,
        [userId, companyId]
      );
      const membership = membershipResult.rows[0];

      // Тот же набор модулей, что у обычной регистрации (auth.routes.js,
      // включая когорту "только безопасность" с 04.09.2026, core/cohort.js) —
      // гость из бесплатного теста и так проверяет только "Безопасность",
      // операционка ему тем более не нужна с первого шага.
      const defaultModules = isNewCohortNow() ? NEW_COHORT_MODULES : [...studioOsBundleKeys(), 'clients', 'visits'];
      for (const moduleKey of defaultModules) {
        await client.query(
          `INSERT INTO company_modules (company_id, module_key, enabled) VALUES ($1, $2, true)
           ON CONFLICT (company_id, module_key) DO NOTHING`,
          [companyId, moduleKey]
        );
      }

      await client.query('COMMIT');

      const token = signCompanyToken({ userId, companyId, membershipId: membership.id, role: membership.role, branchId: null });
      res.status(201).json({ token });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// "Продолжить без оплаты" (24.08.2026, живой разбор воронки: 40 прошли
// бесплатный тест, дальше — либо оплата PDF, либо человек просто уходит,
// ничего не связывает бесплатный тест с самой платформой). Тот же механизм
// ссылки "установить пароль", что и у fulfillGuestReport ниже (claim через
// password_reset_tokens), но доступен сразу после теста, не только после
// оплаты — платить, чтобы сохранить уже пройденный тест, не нужно.
// accepted_terms_at проставляется здесь же — момент явного согласия
// (чекбокс на фронте), как и при обычной оплате/регистрации.
router.post(
  '/claim',
  requireAuth,
  requireTenant,
  asyncHandler(async (req, res) => {
    const { rows: userRows } = await pool.query('SELECT is_guest FROM users WHERE id = $1', [req.user.id]);
    if (!userRows[0]?.is_guest) {
      return res.status(400).json({ error: 'Этот аккаунт уже не гостевой' });
    }
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Укажите email' });
    }
    if (!req.body?.acceptedTerms) {
      return res.status(400).json({ error: 'Нужно принять условия оферты и политики конфиденциальности' });
    }
    const existing = await pool.query('SELECT 1 FROM users WHERE email = $1 AND id != $2', [email, req.user.id]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'Этот email уже зарегистрирован на платформе — войдите в аккаунт, там уже есть доступ ко всему',
      });
    }
    await pool.query(
      'UPDATE users SET email = $2, accepted_terms_at = now(), analytics_consent = $3 WHERE id = $1',
      [req.user.id, email, !!req.body?.analyticsConsent]
    );

    const claimToken = crypto.randomBytes(32).toString('hex');
    const claimTokenHash = crypto.createHash('sha256').update(claimToken).digest('hex');
    const expiresAt = new Date(Date.now() + CLAIM_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [req.user.id, claimTokenHash, expiresAt]
    );
    const claimUrl = `${process.env.FRONTEND_URL}/reset-password/${claimToken}`;

    await sendMail({
      to: email,
      subject: 'Продолжите в «Безопасный бизнес» — результаты теста уже сохранены',
      html:
        `<p>Результаты вашего теста безопасности уже сохранены — не нужно проходить его заново.</p>` +
        `<p>Установите пароль, чтобы зайти в личный кабинет и пользоваться платформой целиком — отслеживать сроки ` +
        `медкнижек, огнетушителей, СОУТ, финансы и остальные документы:</p>` +
        `<p><a href="${claimUrl}">${claimUrl}</a></p><p>Ссылка действует ${CLAIM_TOKEN_TTL_DAYS} дней.</p>`,
    });

    res.json({ ok: true });
  })
);

// Вызывается из вебхука ЮKassa (subscription.routes.js) после того, как
// разовая покупка отчёта (миграция 0091) успешно прошла — но только если
// платит гость (is_guest), у которого нет пароля и, соответственно, нет
// способа войти и скачать PDF сам. Отправляет PDF вложением на почту сразу
// (незачем городить отдельную страницу скачивания по токену — email и так
// уже подтверждён тем, что на него пришло письмо от ЮKassa/чек) + ссылку
// "установить пароль", чтобы данные не пропали, если человек решит стать
// обычным пользователем платформы позже.
async function fulfillGuestReport({ companyId, reportId }) {
  const { rows: ownerRows } = await pool.query(
    `SELECT u.id AS user_id, u.email, u.is_guest
     FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.company_id = $1 AND m.role = 'owner' LIMIT 1`,
    [companyId]
  );
  const owner = ownerRows[0];
  if (!owner || !owner.is_guest) return; // обычная (не гостевая) покупка — ничего сверх обычного вебхука не нужно

  const { rows: reportRows } = await pool.query(
    'SELECT * FROM security_reports WHERE id = $1 AND company_id = $2',
    [reportId, companyId]
  );
  const reportRow = reportRows[0];
  if (!reportRow) return;

  // Ленивое require — report.routes.js подключает довольно тяжёлую цепочку
  // (puppeteer-рендер PDF и т.д.), не нужно тянуть её в обычный путь
  // вебхука (обычные подписки/платные надстройки), только когда реально
  // понадобилось собрать PDF для гостя.
  const { buildReportPdfBuffer } = require('../modules/security/report.routes');
  const pdfBuffer = await buildReportPdfBuffer(companyId, reportRow);

  const claimToken = crypto.randomBytes(32).toString('hex');
  const claimTokenHash = crypto.createHash('sha256').update(claimToken).digest('hex');
  const expiresAt = new Date(Date.now() + CLAIM_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [owner.user_id, claimTokenHash, expiresAt]
  );
  const claimUrl = `${process.env.FRONTEND_URL}/reset-password/${claimToken}`;

  await sendMail({
    to: owner.email,
    subject: 'Ваш отчёт по тесту безопасности готов — «Безопасный бизнес»',
    html:
      `<p>Спасибо за оплату! Полный отчёт по тесту безопасности — во вложении (${reportRow.report_number}.pdf).</p>` +
      `<p>Все ваши ответы уже сохранены. Если захотите продолжить пользоваться платформой (следить за сроками ` +
      `медкнижек, огнетушителей, СОУТ и другими документами) — установите пароль по ссылке, вводить тест заново ` +
      `не понадобится:</p><p><a href="${claimUrl}">${claimUrl}</a></p><p>Ссылка действует ${CLAIM_TOKEN_TTL_DAYS} дней.</p>`,
    attachments: [{ filename: `${reportRow.report_number}.pdf`, content: pdfBuffer }],
  });
}

module.exports = router;
module.exports.fulfillGuestReport = fulfillGuestReport;
