// Бесплатный уровень (18.10.2026, docs/free-tier.md, решение владельца
// «да, поехали»). Раньше после пробного месяца кабинет закрывался целиком
// (tenancy.js → 402). Теперь, если уровень включён для компании, остаётся
// бесплатное навсегда: тест и индекс, список нарушений (только названия),
// «Мои сроки», главная, «Готово» и «Позже», напоминание в день срока.
// По подписке: заключение (штраф, норма, что делать, PDF), напоминания
// заранее, проверка месяца, ИИ, дата с фото документа.
//
// Включение: FREE_TIER_ENABLED=true в .env — для всех; без него — только
// для тестовых компаний (companies.is_test), тихая обкатка.
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
  // Разовые покупки — свои оплаты, подписка для них не нужна.
  '/api/platform/website-check',
  '/api/platform/ai-advisor-subscription',
  '/api/modules/document-templates',
  '/api/modules/security/profile',
  '/api/modules/security/status',
  '/api/modules/security/sessions',
  '/api/modules/security/reports',
  '/api/modules/security/violations',
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

// 'full' — пробный месяц или подписка (как было); 'free' — бесплатный
// уровень; 'locked' — уровень выключен, кабинет закрыт, как раньше.
async function accessLevel(companyId) {
  const row = await companyRow(companyId);
  if (!row) return 'locked';
  if (await isSubscriptionActive(companyId)) return 'full';
  const lockedByTrial = row.created_at >= HARD_TRIAL_CUTOFF && trialExpired(row);
  // Не триал и не активная подписка (отменена, не оплачена) — раньше такие
  // компании не закрывались вовсе (tenancy.js проверял только trial); на
  // бесплатном уровне честно переводим их в бесплатное.
  const notPaying = row.subscription_status !== 'trial';
  if (!lockedByTrial && !notPaying) return 'full';
  if (!enabledFor(row)) return lockedByTrial ? 'locked' : 'full';
  return 'free';
}

// Видно ли заключение (штраф, норма, что делать). Гость без оплаты и
// бесплатный уровень — нет; пробный месяц обычного пользователя и подписка —
// да; любая успешная оплата (заключение за 1990 ₽) — да.
async function canSeeConclusion({ companyId, userId }) {
  const { rows: paid } = await pool.query(
    `SELECT 1 FROM subscription_payments WHERE company_id = $1 AND status = 'succeeded' LIMIT 1`,
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
