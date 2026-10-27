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
const { signCompanyToken, signBaseToken } = require('../core/jwt');
const { studioOsBundleKeys } = require('../core/modules-registry');
const { isNewCohortNow, NEW_COHORT_MODULES } = require('../core/cohort');
const { checkLoginAllowed, recordFailedLogin, checkGuestStartAllowed, recordGuestStart } = require('../core/loginRateLimit');
const { checkGuestSpike } = require('../core/abuseAlerts');
const { requireCaptcha } = require('../core/captcha');
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
  requireCaptcha,
  asyncHandler(async (req, res) => {
    const allowed = await checkLoginAllowed(req.ip, req.ip);
    if (!allowed) {
      return res.status(429).json({ error: 'Слишком много попыток. Попробуйте снова через 15 минут.' });
    }
    await recordFailedLogin(req.ip, req.ip);

    // Шаг 1 защиты от массового обхода (20.09.2026): гостевой старт выдаёт
    // рабочий токен без почты и капчи — через него можно достать содержимое
    // теста и карточки нарушений. Отдельные окна на час и сутки (счётчик в
    // БД, общий для воркеров) поверх прежнего лимита 5 за 15 минут.
    if (!(await checkGuestStartAllowed(req.ip))) {
      return res.status(429).json({ error: 'Слишком много запусков теста с вашего адреса. Попробуйте позже или зарегистрируйтесь.' });
    }
    await recordGuestStart(req.ip);

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
      // Уведомление владельцу платформы, если гостей за час аномально много —
      // после ответа и без ожидания (не должно ни задерживать, ни ронять старт).
      checkGuestSpike().catch((err) => console.error('checkGuestSpike failed:', err));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// Почта перед результатом (25.10.2026, решение владельца по совету
// таргетолога): результат показываем после «куда прислать результат» — это
// тот же /claim ниже. Выключается RESULT_CONTACT_GATE=false в .env (тогда
// результат сразу, как раньше), чтобы откатить без деплоя кода.
router.get('/config', (req, res) => {
  res.json({ contactGate: process.env.RESULT_CONTACT_GATE !== 'false' });
});

// Первое предложение, не длиннее max — «одна строка» штрафа и решения.
// Конец фразы — «; » или точка перед заглавной буквой: иначе «ст. 5.27»
// резалось бы на «ст».
function shortLine(text, max = 200) {
  if (!text) return '';
  const first = String(text).split(/;\s|\.\s(?=[А-ЯЁA-Z«])/)[0].replace(/[;.]$/, '');
  if (first.length <= max) return first;
  return `${first.slice(0, first.lastIndexOf(' ', max))}…`;
}

// Открытые нарушения гостя по убыванию риска и три самых опасных с
// подробностями. Остальное (норма, шаги, инструкции) — в заключении.
async function guestResultSummary(companyId) {
  const repository = require('../modules/security/content/repository');
  const { rows } = await pool.query(
    `SELECT violation_code, niche FROM security_violations WHERE company_id = $1 AND status = 'open'`,
    [companyId]
  );
  const matrices = {};
  const items = [];
  for (const row of rows) {
    if (!(row.niche in matrices)) matrices[row.niche] = (await repository.getViolationMatrix(row.niche)) || [];
    const v = matrices[row.niche].find((x) => x.code === row.violation_code);
    if (v) items.push(v);
  }
  items.sort((a, b) => (b.risk || 0) - (a.risk || 0));
  const top = items.slice(0, 3).map((v) => ({
    code: v.code,
    title: v.title,
    risk: v.risk,
    fine: shortLine(v.fineText),
    whatToDo: shortLine(v.solution),
  }));
  return { titles: items.map((v) => v.title), top };
}

// Отписка от рекламных писем одним нажатием (проверка 27.10.2026): раньше
// только «ответьте на письмо», и владелец снимал согласие вручную. Ссылка
// подписана HMAC от JWT_SECRET — чужой id подставить нельзя.
function unsubscribeSig(userId) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(`unsubscribe:${userId}`).digest('hex').slice(0, 32);
}

function unsubscribeUrl(userId) {
  return `${process.env.FRONTEND_URL}/api/platform/anonymous-audit/unsubscribe?u=${userId}&s=${unsubscribeSig(userId)}`;
}

async function unsubscribe(req, res) {
  const userId = Number(req.query.u);
  const sig = String(req.query.s || '');
  const expected = unsubscribeSig(userId);
  if (!Number.isInteger(userId) || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.status(400).type('html').send('<p>Ссылка недействительна. Ответьте на письмо — отпишем вручную.</p>');
  }
  await pool.query('UPDATE users SET marketing_consent_at = NULL WHERE id = $1', [userId]);
  res.type('html').send('<meta charset="utf-8"><p style="font-family:sans-serif">Готово: больше не будем присылать полезное и предложения. Письма о вашем кабинете и сроках это не затрагивает.</p>');
}
// GET — ссылка из письма; POST — «отписаться одним нажатием» почтовых программ.
router.get('/unsubscribe', asyncHandler(unsubscribe));
router.post('/unsubscribe', asyncHandler(unsubscribe));

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Три пункта бесплатно — только тому, кто оставил почту (accepted_terms_at и
// настоящая почта ставит /claim).
router.get(
  '/top-risks',
  requireAuth,
  requireTenant,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT email, accepted_terms_at FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!user?.accepted_terms_at || user.email.endsWith('@guest.business-safe.internal')) {
      return res.status(403).json({ error: 'Сначала укажите почту' });
    }
    const { top } = await guestResultSummary(req.tenant.companyId);
    res.json({ top });
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
    // Повтор /claim законен (опечатка в почте, «Сохранить бесплатно» после
    // результата), но без лимита с одного гостевого токена можно слать письма
    // на любые адреса и по 409 выяснять, кто уже клиент (проверка 27.10.2026).
    const claimKey = `claim:${req.user.id}`;
    if (!(await checkLoginAllowed(req.ip, claimKey))) {
      return res.status(429).json({ error: 'Слишком много попыток. Попробуйте через 15 минут' });
    }
    await recordFailedLogin(req.ip, claimKey);
    const existing = await pool.query('SELECT 1 FROM users WHERE email = $1 AND id != $2', [email, req.user.id]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'Этот email уже зарегистрирован на платформе — войдите в аккаунт, там уже есть доступ ко всему',
      });
    }
    // marketing_consent_at (25.10.2026, миграция 0158) — необязательная
    // галочка «присылать полезное и предложения»; без неё — только результат.
    // Согласие привязано к почте: сменил адрес без галочки — согласия у нового
    // адреса нет (иначе рассылка ушла бы тому, кто его не давал, 27.10.2026).
    const { rows: before } = await pool.query(
      `SELECT accepted_terms_at FROM users WHERE id = $1`,
      [req.user.id]
    );
    const firstClaim = !before[0]?.accepted_terms_at;
    await pool.query(
      `UPDATE users SET email = $2, accepted_terms_at = now(), analytics_consent = $3,
              marketing_consent_at = CASE WHEN $4 THEN now()
                                          WHEN email = $2 THEN marketing_consent_at
                                          ELSE NULL END
       WHERE id = $1`,
      [req.user.id, email, !!req.body?.analyticsConsent, !!req.body?.marketingConsent]
    );
    // Пробный месяц — с момента, когда человек сохранил результат, а не с
    // начала гостевого теста (18.10.2026): иначе вернувшийся через три недели
    // получал неделю. Только для ещё не оплаченного триала и только при первом
    // сохранении — повтор /claim не продлевает месяц бесконечно (27.10.2026).
    if (firstClaim) {
      await pool.query(
        `UPDATE companies SET trial_ends_at = now() + interval '30 days'
         WHERE id = $1 AND subscription_status = 'trial'`,
        [req.tenant.companyId]
      );
    }

    // Ссылки, отправленные на прежний адрес, больше не действуют.
    await pool.query(
      `UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`,
      [req.user.id]
    );
    const claimToken = crypto.randomBytes(32).toString('hex');
    const claimTokenHash = crypto.createHash('sha256').update(claimToken).digest('hex');
    const expiresAt = new Date(Date.now() + CLAIM_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [req.user.id, claimTokenHash, expiresAt]
    );
    const claimUrl = `${process.env.FRONTEND_URL}/reset-password/${claimToken}`;

    // С 25.10.2026 /claim вызывается перед экраном результата («куда прислать
    // результат»), поэтому в письме — сам результат: что нашли и три самых
    // опасных пункта с подробностями, как на экране.
    const summary = await guestResultSummary(req.tenant.companyId);
    const resultHtml = summary.titles.length === 0
      ? `<p>Нарушений не нашли — по вашим ответам всё в порядке.</p>`
      : `<p><b>Что нашли — ${summary.titles.length}:</b></p><ul>${summary.titles.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>` +
        `<p><b>Самое важное:</b></p>` +
        summary.top.map((v) => `<p><b>${escapeHtml(v.title)}</b><br>Штраф: ${escapeHtml(v.fine)}<br>Что сделать: ${escapeHtml(v.whatToDo)}</p>`).join('') +
        `<p>Штраф, норма закона и план по каждому пункту — в заключении. Его можно получить в кабинете.</p>`;

    await sendMail({
      to: email,
      subject: 'Результат теста — «Безопасный бизнес»',
      html:
        `<p>Здравствуйте! Вот результат вашего теста.</p>` +
        resultHtml +
        `<p>Результат уже сохранён в кабинете. Установите пароль, чтобы войти — проходить тест заново не нужно. ` +
        `Месяц полного доступа без карты: список дел по найденному и напоминания о сроках.</p>` +
        `<p><a href="${claimUrl}">${claimUrl}</a></p><p>Ссылка действует ${CLAIM_TOKEN_TTL_DAYS} дней.</p>`,
      meta: { purpose: 'guest_result' },
    });

    res.json({ ok: true });
  })
);

// Сразу в кабинет, без похода в почту (24.10.2026, решение владельца).
// Страница теста после возврата с ЮKassa спрашивает, прошла ли оплата
// (вебхук асинхронный), и как только прошла — предлагает придумать пароль.
// Тот же гостевой токен, что вёл тест, — другого способа доказать, что это
// тот же человек, здесь не нужно: почту и согласие он ввёл в этой же вкладке.
router.get(
  '/payment-status',
  requireAuth,
  requireTenant,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM subscription_payments WHERE company_id = $1 AND status = 'succeeded' AND report_id IS NOT NULL
         UNION ALL
         SELECT 1 FROM addon_purchases WHERE company_id = $1 AND status = 'succeeded'
       ) AS paid`,
      [req.tenant.companyId]
    );
    res.json({ paid: !!rows[0].paid, email: req.user.email });
  })
);

// Придумать пароль прямо на странице теста — после оплаты или после «открыть
// приложение бесплатно» (claim). Условие — гость уже указал настоящую почту и
// принял оферту (это делают и чек-аут, и claim). Почта при этом не
// подтверждена кодом — решение владельца: пускаем сразу, а вход с другого
// устройства всё равно попросит код с этой почты (auth.routes.js,
// loginOrRequireVerification). Это устройство запоминаем как подтверждённое.
router.post(
  '/set-password',
  requireAuth,
  requireTenant,
  asyncHandler(async (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (password.length < 8) {
      return res.status(400).json({ error: 'Пароль должен быть не короче 8 символов' });
    }
    const { rows: userRows } = await pool.query(
      'SELECT is_guest, email, accepted_terms_at FROM users WHERE id = $1',
      [req.user.id]
    );
    const guest = userRows[0];
    if (!guest?.is_guest) {
      return res.status(400).json({ error: 'Пароль уже установлен — войдите в кабинет' });
    }
    if (!guest.accepted_terms_at || guest.email.endsWith('@guest.business-safe.internal')) {
      return res.status(400).json({ error: 'Сначала укажите почту' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // date_trunc до секунды: новый токен ниже подписан в ту же секунду, а
    // core/middleware/auth.js отклоняет токены, выданные раньше смены пароля
    // (iat в секундах). Гостевой токен этой вкладки после этого не нужен.
    await pool.query(
      `UPDATE users SET password_hash = $2, password_changed_at = date_trunc('second', now()), is_guest = false WHERE id = $1`,
      [req.user.id, passwordHash]
    );

    const deviceToken = crypto.randomBytes(32).toString('hex');
    const deviceTokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');
    await pool.query('INSERT INTO trusted_devices (user_id, device_token_hash) VALUES ($1, $2)', [req.user.id, deviceTokenHash]);

    const { rows: users } = await pool.query(
      'SELECT id, name, email, phone, is_super_admin, analytics_consent, avatar_url, onboarding_seen_at FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json({ token: signBaseToken(req.user.id), user: users[0], deviceToken });
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
// Как получить документы после оплаты — в письме за набор и за документы
// (24.10.2026, владелец: в письме прямо сказать, что документы собираются в
// кабинете, — сами на почту они не приходят).
const DOCUMENTS_STEPS_HTML =
  `<p><b>Документы на почту не приходят — их нужно собрать в кабинете</b> (это пара минут):</p>` +
  `<ol>` +
  `<li>Войдите в кабинет — по паролю, который вы придумали после оплаты, или по ссылке ниже.</li>` +
  `<li>Откройте «Безопасность» → «Обзор» → «Шаблоны документов».</li>` +
  `<li>Нажмите «Собрать все документы» и заполните одну анкету: название, ИНН, адрес, что есть на сайте. ` +
  `Если вы указывали ИНН в тесте, часть полей уже заполнена. Анкета общая на все документы и сохраняется сама.</li>` +
  `<li>Нажмите «Собрать PDF» — готовые документы с вашими данными можно скачать, проверить и подписать.</li>` +
  `</ol>`;

// withDocuments — набор «заключение + документы» (24.10.2026): то же письмо,
// плюс абзац, где заполнить анкету для документов.
async function fulfillGuestReport({ companyId, reportId, withDocuments = false }) {
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

  // Подарочный месяц к заключению (14.10.2026, миграция 0132) — вебхук
  // ставит gift до вызова этой функции; если его нет (купили не из триала),
  // письмо остаётся прежним, без обещания месяца.
  const { rows: giftRows } = await pool.query(
    `SELECT subscription_current_period_end FROM companies WHERE id = $1 AND subscription_status = 'gift'`,
    [companyId]
  );
  const giftUntil = giftRows[0]
    ? new Date(giftRows[0].subscription_current_period_end).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    : null;
  const nextStepHtml = giftUntil
    ? `<p>В подарок к заключению мы открыли вам полный доступ к кабинету — до ${giftUntil}. Ваши нарушения уже ` +
      `лежат там списком дел: отмечайте, что устранили, и смотрите, как растёт индекс; приложение напомнит о сроках ` +
      `документов. Карта не сохранена — сами мы ничего не спишем.</p>` +
      `<p>Чтобы войти, установите пароль по ссылке — проходить тест заново не нужно:</p>`
    : `<p>Все ваши ответы уже сохранены. Если захотите продолжить пользоваться платформой (следить за сроками ` +
      `медкнижек, огнетушителей, СОУТ и другими документами) — установите пароль по ссылке, вводить тест заново ` +
      `не понадобится:</p>`;

  const documentsHtml = withDocuments ? DOCUMENTS_STEPS_HTML : '';

  await sendMail({
    to: owner.email,
    subject: withDocuments
      ? 'Заключение готово, документы ждут анкету — «Безопасный бизнес»'
      : 'Ваше заключение по тесту безопасности готово — «Безопасный бизнес»',
    html:
      `<p>Спасибо за оплату! Заключение по тесту безопасности — во вложении (${reportRow.report_number}.pdf).</p>` +
      documentsHtml +
      nextStepHtml +
      `<p><a href="${claimUrl}">${claimUrl}</a></p><p>Ссылка действует ${CLAIM_TOKEN_TTL_DAYS} дней.</p>`,
    attachments: [{ filename: `${reportRow.report_number}.pdf`, content: pdfBuffer }],
    meta: { purpose: 'report_purchase', refTable: 'security_reports', refId: reportRow.id },
  });
}

// «Документы студии», купленные гостем прямо с экрана результата теста
// (21.10.2026). PDF сразу не шлём — документы собираются из анкеты (ИНН,
// адрес, что есть на сайте), а её заполняют в кабинете. Поэтому письмо —
// ссылка «установить пароль» и куда идти дальше.
async function fulfillGuestDocuments({ companyId }) {
  const { rows: ownerRows } = await pool.query(
    `SELECT u.id AS user_id, u.email, u.is_guest
     FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.company_id = $1 AND m.role = 'owner' LIMIT 1`,
    [companyId]
  );
  const owner = ownerRows[0];
  if (!owner || !owner.is_guest) return;

  const claimToken = crypto.randomBytes(32).toString('hex');
  const claimTokenHash = crypto.createHash('sha256').update(claimToken).digest('hex');
  const expiresAt = new Date(Date.now() + CLAIM_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [owner.user_id, claimTokenHash, expiresAt]
  );
  const claimUrl = `${process.env.FRONTEND_URL}/reset-password/${claimToken}`;

  const { rows: giftRows } = await pool.query(
    `SELECT subscription_current_period_end FROM companies WHERE id = $1 AND subscription_status = 'gift'`,
    [companyId]
  );
  const giftHtml = giftRows[0]
    ? `<p>В подарок к документам — полный доступ к кабинету до ${new Date(giftRows[0].subscription_current_period_end).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}: ` +
      `напоминания о сроках заранее и план по вашему тесту. Карта не сохранена — сами мы ничего не спишем.</p>`
    : '';

  await sendMail({
    to: owner.email,
    subject: 'Оплата прошла — заполните данные для «Документов студии»',
    html:
      `<p>Спасибо за оплату!</p>` +
      DOCUMENTS_STEPS_HTML +
      `<p>Если пароль ещё не придумали — установите его по ссылке, проходить тест заново не нужно:</p>` +
      `<p><a href="${claimUrl}">${claimUrl}</a></p><p>Ссылка действует ${CLAIM_TOKEN_TTL_DAYS} дней.</p>` +
      giftHtml,
    meta: { purpose: 'documents_purchase' },
  });
}

module.exports = router;
module.exports.unsubscribeUrl = unsubscribeUrl;
module.exports.fulfillGuestReport = fulfillGuestReport;
module.exports.fulfillGuestDocuments = fulfillGuestDocuments;
module.exports.guestResultSummary = guestResultSummary;
module.exports.escapeHtml = escapeHtml;
module.exports.CLAIM_TOKEN_TTL_DAYS = CLAIM_TOKEN_TTL_DAYS;
