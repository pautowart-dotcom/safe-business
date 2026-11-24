// Бесплатный кабинет после пробного месяца снят 24.11.2026 (решение
// владельца): остаются пробный период, подписка и подарочный доступ.
// Когда они кончились, кабинет закрывается (tenancy.js → 402). Тест и его
// результат по-прежнему открыты отдельными путями. Компании, созданные до
// 27.07.2026 и всё ещё в статусе trial, не закрываем — так было решено
// раньше, чтобы не оборвать уже работающие кабинеты без отдельного разбора.
const pool = require('../db/pool');
const { isSubscriptionActive } = require('./middleware/subscription');

const HARD_TRIAL_CUTOFF = new Date('2026-07-27T00:00:00Z');

// Что открыто бесплатному уровню после пробного месяца. Всё остальное
// отвечает 402 { paidFeature: true } — без жёсткого перехода на страницу
// подписки (его делает только requiresSubscription, см. api/client.js).
const FREE_PATH_PREFIXES = [
  '/api/platform/companies',
  '/api/platform/subscription',
  '/api/platform/modules',
  '/api/platform/notifications',
  '/api/platform/push',
  '/api/platform/deadlines',
  '/api/platform/my-deadlines',
  '/api/platform/watch-feed',
  '/api/platform/dashboard',
  '/api/platform/daily-tasks',
  '/api/platform/opening',
  '/api/platform/business-status',
  '/api/platform/memberships',
  '/api/platform/support',
  '/api/platform/client-errors',
  '/api/platform/addons',
  '/api/platform/franchise',
  '/api/platform/franchise-tasks',
  '/api/platform/franchise-standards',
  '/api/platform/franchise-assistant',
  '/api/platform/my-points',
  // «Ваш бизнес снаружи» (22.10.2026): снимок бесплатный, платное
  // (мастера) роут отсекает сам — 402 paidFeature.
  '/api/platform/outside-watch',
  // Разовые покупки — свои оплаты, подписка для них не нужна.
  '/api/platform/website-check',
  '/api/platform/ai-advisor-subscription',
  '/api/modules/document-templates',
  '/api/modules/security/profile',
  '/api/modules/security/status',
  '/api/modules/security/sessions',
  '/api/modules/security/reports',
  '/api/modules/security/violations',
  // Инструкции (25.10.2026): доступ проверяет сам роут — заключение или
  // покупка пакета документов (security.routes.js canSeeInstructions).
  '/api/modules/security/instructions',
];

// Платное внутри открытых разделов.
const PAID_PATH_PATTERNS = [
  /^\/api\/platform\/my-deadlines\/slots\/[^/]+\/detect-date/,
];

function isFreePath(url) {
  const path = url.split('?')[0];
  if (PAID_PATH_PATTERNS.some((re) => re.test(path))) return false;
  return FREE_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));
}

async function companyRow(companyId) {
  const { rows } = await pool.query(
    'SELECT subscription_status, trial_ends_at, created_at, is_test FROM companies WHERE id = $1',
    [companyId]
  );
  return rows[0] || null;
}

function enabledFor(row) {
  return process.env.FREE_TIER_ENABLED === 'true' || !!row?.is_test;
}

function trialExpired(row) {
  return row?.subscription_status === 'trial' && row.trial_ends_at && new Date(row.trial_ends_at) < new Date();
}

// 'full' — идёт пробный период, подписка или подарочный доступ.
// 'locked' — кабинет закрыт. 'free' больше не возвращается.
async function accessLevel(companyId) {
  const row = await companyRow(companyId);
  if (!row) return 'locked';
  if (await isSubscriptionActive(companyId)) return 'full';
  if (row.subscription_status === 'trial' && !trialExpired(row)) return 'full';
  if (row.created_at < HARD_TRIAL_CUTOFF && row.subscription_status === 'trial') return 'full';
  return 'locked';
}

// Видно ли заключение (штраф, норма, что делать). Гость без оплаты и
// бесплатный уровень — нет; пробный месяц обычного пользователя и подписка —
// да; любая успешная оплата (заключение за 1990 ₽) — да. Набор «заключение +
// документы» (5990 ₽) оплачивается через addon_purchases с report_id — это
// тоже оплаченное заключение (проверка 27.10.2026: после подарочного месяца
// у купивших набор пропадали штраф и решение в «Шагах»).
async function canSeeConclusion({ companyId, userId }) {
  const { rows: paid } = await pool.query(
    `SELECT 1 FROM subscription_payments WHERE company_id = $1 AND status = 'succeeded'
     UNION ALL
     SELECT 1 FROM addon_purchases WHERE company_id = $1 AND status = 'succeeded' AND report_id IS NOT NULL
     LIMIT 1`,
    [companyId]
  );
  if (paid.length > 0) return true;
  const { rows: u } = await pool.query('SELECT is_guest FROM users WHERE id = $1', [userId]);
  if (u[0]?.is_guest) return false;
  // 'locked' (уровень выключен) — как было до 18.10: зарегистрированный
  // клиент видит результат полностью. Урезаем только бесплатный уровень.
  return (await accessLevel(companyId)) !== 'free';
}

// Только то, что бесплатно: название, риск, статус.
function namesOnly(v) {
  return { id: v.id, code: v.code, block: v.block, title: v.title, risk: v.risk, status: v.status, resolvedAt: v.resolvedAt, inDocumentsPack: v.inDocumentsPack, locked: true };
}

module.exports = { accessLevel, canSeeConclusion, namesOnly, isFreePath, enabledFor, HARD_TRIAL_CUTOFF };
