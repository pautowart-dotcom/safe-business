// Инструменты ИИ-управляющего в кабинете платформы (21.08.2026) — читающие
// только (никаких validate/buildConfirmation/execute-на-запись, как у
// клиентского ассистента, modules/ai-assistant/tools/registry.js) — этот
// ассистент видит данные ВСЕХ компаний платформы, писать сюда действие
// с подтверждением можно было бы, но owner попросил именно "чтение и
// анализ" на первую версию, не действия. Запросы — те же, что уже
// проверены в admin.routes.js (/metrics, /companies), не дублируют логику
// заново с нуля.
const pool = require('../db/pool');

function money(v) {
  return `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
}

async function executeGetPlatformOverview() {
  const [statusCounts, activeLast7Days, supportCounts, aiUsage, aiSubscribers] = await Promise.all([
    pool.query(
      `SELECT subscription_status, COUNT(*) AS n,
              COUNT(*) FILTER (WHERE created_at > now() - interval '7 days') AS new_7d
       FROM companies WHERE is_test = false GROUP BY subscription_status`
    ),
    pool.query(
      `SELECT COUNT(DISTINCT e.company_id) AS n FROM event_log e
       JOIN companies c ON c.id = e.company_id
       WHERE e.created_at > now() - interval '7 days' AND c.is_test = false`
    ),
    pool.query(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE sr.created_at > now() - interval '7 days') AS last_7d
       FROM support_requests sr LEFT JOIN companies c ON c.id = sr.company_id
       WHERE c.id IS NULL OR c.is_test = false`
    ),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE m.created_at > now() - interval '30 days') AS n
       FROM ai_assistant_messages m JOIN companies c ON c.id = m.company_id
       WHERE m.role = 'user' AND c.is_test = false`
    ),
    pool.query(`SELECT COUNT(*) AS n FROM companies WHERE is_test = false AND ai_advisor_subscription_status IN ('active', 'past_due')`),
  ]);

  const byStatus = Object.fromEntries(statusCounts.rows.map((r) => [r.subscription_status, r]));
  const total = statusCounts.rows.reduce((s, r) => s + Number(r.n), 0);
  const active = Number(byStatus.active?.n || 0);

  return [
    `Компаний всего: ${total} (активных подписок: ${active}, триал: ${byStatus.trial?.n || 0}, past_due: ${byStatus.past_due?.n || 0}, отменённых: ${byStatus.cancelled?.n || 0}).`,
    `Новых компаний за 7 дней: ${statusCounts.rows.reduce((s, r) => s + Number(r.new_7d), 0)}.`,
    `Активны за 7 дней (хотя бы одно действие): ${activeLast7Days.rows[0].n}.`,
    `Оценка MRR: ${money(active * 1990)} (активные × текущая цена, не факт из платёжки).`,
    `Обращений в поддержку: ${supportCounts.rows[0].total} всего, ${supportCounts.rows[0].last_7d} за 7 дней.`,
    `ИИ-ассистент: ${aiSubscribers.rows[0].n} подписчиков, ${aiUsage.rows[0].n} сообщений за 30 дней.`,
  ].join('\n');
}

async function executeFindCompany(params) {
  const q = params?.name;
  if (!q || typeof q !== 'string' || !q.trim()) return 'Укажите название компании для поиска.';
  const { rows } = await pool.query(
    `SELECT id, name, subscription_status, industry_segment, created_at, trial_ends_at, subscription_current_period_end
     FROM companies WHERE name ILIKE '%' || $1 || '%' AND is_test = false ORDER BY created_at DESC LIMIT 5`,
    [q.trim()]
  );
  if (rows.length === 0) return `Компаний с названием, похожим на «${q}», не найдено.`;
  return rows
    .map((c) => {
      const parts = [`«${c.name}» (#${c.id}, ниша: ${c.industry_segment || '—'}) — статус: ${c.subscription_status}`];
      if (c.subscription_status === 'trial' && c.trial_ends_at) parts.push(`, триал до ${new Date(c.trial_ends_at).toLocaleDateString('ru-RU')}`);
      if (c.subscription_current_period_end) parts.push(`, оплачено до ${new Date(c.subscription_current_period_end).toLocaleDateString('ru-RU')}`);
      parts.push(`, зарегистрирована ${new Date(c.created_at).toLocaleDateString('ru-RU')}`);
      return parts.join('');
    })
    .join('\n');
}

const STATUS_LABELS = { trial: 'триал', active: 'активная подписка', past_due: 'проблема с оплатой', cancelled: 'отменена' };

async function executeListCompaniesByStatus(params) {
  const status = params?.status;
  if (!STATUS_LABELS[status]) {
    return `Статус должен быть одним из: ${Object.keys(STATUS_LABELS).join(', ')}.`;
  }
  const { rows } = await pool.query(
    `SELECT id, name, created_at FROM companies WHERE subscription_status = $1 AND is_test = false ORDER BY created_at DESC LIMIT 20`,
    [status]
  );
  if (rows.length === 0) return `Компаний со статусом «${STATUS_LABELS[status]}» сейчас нет.`;
  const list = rows.map((c) => `«${c.name}» (#${c.id}, с ${new Date(c.created_at).toLocaleDateString('ru-RU')})`).join(', ');
  return `Компаний со статусом «${STATUS_LABELS[status]}»: ${rows.length}${rows.length === 20 ? '+' : ''} — ${list}.`;
}

const REGISTRY = [
  {
    name: 'get_platform_overview',
    description: 'Общая картина по всей платформе: число компаний по статусам, новые за 7 дней, активность, оценка MRR, обращения в поддержку, использование ИИ-ассистента. Используй для вопросов "как у нас дела в целом".',
    readOnly: true,
    parameters: { type: 'object', properties: {} },
    execute: executeGetPlatformOverview,
  },
  {
    name: 'find_company',
    description: 'Найти компанию по названию (частичное совпадение) и посмотреть её статус подписки/даты.',
    readOnly: true,
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Название компании или его часть, как назвал пользователь.' } },
      required: ['name'],
    },
    execute: executeFindCompany,
  },
  {
    name: 'list_companies_by_status',
    description: 'Список компаний с конкретным статусом подписки — например, у кого проблема с оплатой (past_due) или кто ещё в триале.',
    readOnly: true,
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: Object.keys(STATUS_LABELS), description: 'trial / active / past_due / cancelled.' },
      },
      required: ['status'],
    },
    execute: executeListCompaniesByStatus,
  },
];

function getTool(name) {
  return REGISTRY.find((t) => t.name === name) || null;
}

function listToolDefinitions() {
  return REGISTRY.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
}

module.exports = { getTool, listToolDefinitions };
