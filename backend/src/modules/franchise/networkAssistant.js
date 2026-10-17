// ИИ-помощник сети (17.10.2026) — чат и сводка в пульте франчайзера.
// Тот же принцип, что у ИИ-советника точки (ai-advisor-subscription.routes.js):
// ИИ ничего не считает сам, только объясняет факты, которые уже показаны в
// пульте — сводка точек, стандарты и проверки, задачи сети, оформление
// сотрудников. Видит ровно то, что видит спрашивающий: сотруднику сети —
// без индексов, зон и нарушений (как /franchise/summary).
//
// Названия точек в YandexGPT не уходят: в промпте «Точка 1…N», в ответе
// номера заменяются обратно на названия (название ИП часто = ФИО).
const pool = require('../../db/pool');
const { computeNetworkSummary } = require('./networkSummary');
const { listStandards, latestChecksByPoint, checkDetail } = require('./standards');

const DAY = 24 * 3600 * 1000;

function daysSince(date) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / DAY);
}

async function buildNetworkContext(access) {
  const groupId = access.group.id;
  const [{ members, network }, standards, latest, tasks] = await Promise.all([
    computeNetworkSummary(access.group),
    listStandards(groupId),
    latestChecksByPoint(groupId),
    pool.query(
      `SELECT t.title, to_char(t.due_date, 'YYYY-MM-DD') AS due_date,
              count(c.id)::int AS total, count(c.id) FILTER (WHERE tp.done_at IS NOT NULL)::int AS done,
              array_agg(tp.company_id) FILTER (WHERE tp.done_at IS NULL AND c.id IS NOT NULL) AS not_done
       FROM franchise_tasks t
       LEFT JOIN franchise_task_points tp ON tp.task_id = t.id
       LEFT JOIN companies c ON c.id = tp.company_id AND c.franchise_group_id = t.franchise_group_id
       WHERE t.franchise_group_id = $1 AND t.archived_at IS NULL
       GROUP BY t.id ORDER BY t.created_at DESC LIMIT 10`,
      [groupId]
    ),
  ]);

  const alias = new Map(members.map((m, i) => [m.companyId, `Точка ${i + 1}`]));
  const names = members.map((m) => m.companyName);
  const full = access.canManage;
  const lines = [];
  const today = new Date().toISOString().slice(0, 10);

  lines.push(`Сегодня ${today}. Сеть: ${members.length} точек, готовятся к открытию: ${network.pointsPreparing}.`);
  if (full && network.averageIndexPercent != null) lines.push(`Средний индекс безопасности по сети: ${network.averageIndexPercent}%.`);
  lines.push(`Стандартов сети: ${standards.length}.`);

  for (const m of members) {
    const parts = [];
    if (m.opening) parts.push(`готовится к открытию, отмечено ${m.opening.done} из ${m.opening.total} шагов, сейчас: ${m.opening.currentStage || 'все шаги отмечены'}`);
    else if (full) parts.push(m.indexPercent != null ? `индекс ${m.indexPercent}%, зона ${m.zone}, открытых нарушений ${Math.max((m.violationsCount || 0) - (m.resolvedCount || 0), 0)}` : 'тест безопасности не пройден');
    parts.push(`подошло сроков: ${m.overdueDeadlines}`);
    const inactive = daysSince(m.lastActiveAt);
    parts.push(inactive == null ? 'активность не записана' : `заходили ${inactive} дн. назад`);
    if (m.staffTotal) parts.push(`сотрудников ${m.staffTotal}, оформлены не до конца ${m.staffWithOpenSteps}`);
    const checks = latest.get(m.companyId) || {};
    parts.push(checks.self ? `самопроверка по стандартам ${checks.self.percent}% (${checks.self.date})` : 'самопроверки по стандартам не было');
    parts.push(checks.audit ? `проверка от сети ${checks.audit.percent}% (${checks.audit.date}, ${daysSince(checks.audit.date)} дн. назад)` : 'проверок от сети не было');
    const risk = (full ? m.riskReasons : m.riskReasons.filter((r) => r !== 'Красная зона'));
    if (risk.length) parts.push(`сигналы риска: ${risk.join(', ')}`);
    lines.push(`- ${alias.get(m.companyId)}: ${parts.join('; ')}.`);
  }

  // Что именно не так по последним проверкам от сети — только названия пунктов.
  const auditGaps = [];
  for (const m of members) {
    const audit = latest.get(m.companyId)?.audit;
    if (!audit) continue;
    const bad = (await checkDetail(audit.checkId)).filter((a) => a.result === 'no' || a.result === 'partial');
    if (bad.length) auditGaps.push(`- ${alias.get(m.companyId)}: ${bad.map((a) => `${a.title} (${a.result === 'no' ? 'нет' : 'частично'})`).join('; ')}`);
  }
  if (auditGaps.length) {
    lines.push('Замечания последних проверок от сети:');
    lines.push(...auditGaps);
  }

  if (tasks.rows.length) {
    lines.push('Задачи сети точкам:');
    for (const t of tasks.rows) {
      const lagging = (t.not_done || []).map((id) => alias.get(id)).filter(Boolean);
      lines.push(`- «${t.title}»${t.due_date ? `, срок ${t.due_date}` : ''}: выполнили ${t.done} из ${t.total}${lagging.length ? `; не выполнили: ${lagging.join(', ')}` : ''}.`);
    }
  }

  return { text: lines.join('\n'), names };
}

// «Точка 3», «Точке 3», «Точку 3»… → «Название точки».
function restoreNames(answer, names) {
  return answer.replace(/Точк(?:а|е|и|у|ой)\s+(\d+)(?!\d)/g, (match, n) => {
    const name = names[Number(n) - 1];
    return name ? `«${name}»` : match;
  });
}

const BASE_RULES =
  'Ты — ИИ-помощник владельца сети (франчайзера) в сервисе «Безопасный бизнес». Тебе даны факты о точках сети: ' +
  'безопасность, сроки, активность, оформление сотрудников, стандарты сети и проверки, задачи сети. Точки названы ' +
  '«Точка 1», «Точка 2» и т.д. — называй их только так. Используй ТОЛЬКО эти факты, не выдумывай других. ' +
  'Стандарты сети — требования самой сети, а не закона, не путай их. Если точка оценивает себя заметно выше, чем ' +
  'проверка от сети, — это важный сигнал. Не обещай результата и не пугай проверками; тон честный, простой, по делу. ' +
  'Если для ответа не хватает данных — так и скажи и подскажи, что сделать в пульте (провести проверку, отправить задачу).';

const DIGEST_PROMPT =
  `${BASE_RULES} Задача: короткая сводка для владельца сети — 3–5 пунктов: где сейчас хуже всего и почему, ` +
  'кого давно не проверяли или кто не заходит, что сделать на этой неделе. Без вступлений.';

const CHAT_PROMPT = `${BASE_RULES} Отвечай на вопрос владельца сети кратко — 3–6 предложений или короткий список.`;

module.exports = { buildNetworkContext, restoreNames, DIGEST_PROMPT, CHAT_PROMPT };
