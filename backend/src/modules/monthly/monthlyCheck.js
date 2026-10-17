// Проверка месяца (17.10.2026, этап 7, миграция 0140). Вопросы собираются
// из данных самой точки — новый контент под 37 ниш не нужен:
//   1) до 3 самых рискованных открытых нарушений — «„…“ — исправили?»;
//   2) до 2 сроков на ближайшие 30 дней (или подошедших) — «сделали?»;
//   3) до 2 невыполненных задач сети, если точка в сети;
//   4) 2 регулярные вещи, общие для всех (меняются по месяцам).
// Не больше 7 вопросов. Ответ «да» сразу закрывает нарушение / срок /
// задачу — той же логикой, что кнопки в кабинете.
const pool = require('../../db/pool');
const repository = require('../security/content/repository');
const { clearAction, nextDueDate } = require('../../core/deadlines');
const { computeSecurityStatus } = require('../security/status');
const { moscowDateStr } = require('../../utils/moscowDate');

const MAX_ITEMS = 7;
const SKIP_MONTHS = 6;
const ANSWERS = ['yes', 'no', 'skip'];

// Без статей и сумм: это повод посмотреть, а не новое «нарушение».
const REGULAR = [
  { key: 'fire_ext', title: 'Огнетушители на месте, пломба цела, стрелка манометра в зелёной зоне?' },
  { key: 'first_aid', title: 'Аптечка полная, сроки годности не вышли?' },
  { key: 'consumer_corner', title: 'Уголок потребителя актуален: цены, режим работы, контакты?' },
  { key: 'evacuation', title: 'Пути эвакуации свободны, табличка «Выход» видна?' },
  { key: 'client_docs', title: 'У новых клиентов подписаны договор и согласие на обработку данных?' },
  { key: 'staff_books', title: 'Медкнижки сотрудников не просрочены? (Только посмотрите — сюда не вносим.)' },
];

function currentMonth() {
  return moscowDateStr(new Date()).slice(0, 7);
}

function regularFor(month) {
  const n = Number(month.slice(5, 7));
  return [REGULAR[(n * 2) % REGULAR.length], REGULAR[(n * 2 + 1) % REGULAR.length]];
}

async function buildItems(companyId, month = currentMonth()) {
  const today = moscowDateStr(new Date());
  const [{ rows: violations }, { rows: deadlines }, { rows: tasks }] = await Promise.all([
    pool.query(`SELECT id, violation_code, niche FROM security_violations WHERE company_id = $1 AND status = 'open'`, [companyId]),
    pool.query(
      `SELECT id, title, to_char(due_date, 'YYYY-MM-DD') AS due_date FROM deadlines
       WHERE company_id = $1 AND kind = 'deadline' AND status = 'pending' AND category <> 'journals'
         AND due_date <= $2::date + 30
       ORDER BY due_date LIMIT 2`,
      [companyId, today]
    ),
    pool.query(
      `SELECT t.id, t.title FROM franchise_task_points tp
       JOIN franchise_tasks t ON t.id = tp.task_id
       JOIN companies c ON c.id = tp.company_id AND c.franchise_group_id = t.franchise_group_id
       WHERE tp.company_id = $1 AND tp.done_at IS NULL AND t.archived_at IS NULL
       ORDER BY t.due_date NULLS LAST LIMIT 2`,
      [companyId]
    ),
  ]);

  const detailed = [];
  for (const v of violations) {
    const d = await repository.getViolation(v.niche, v.violation_code);
    if (d) detailed.push({ id: v.id, title: d.title, risk: d.risk || 0, solution: d.solution });
  }
  // Чередование и «Не получится» (17.10.2026, владелец: «подмену трудовых
  // отношений малый бизнес до конца не исправит»): нарушение с ответом
  // «Не получится» не спрашиваем полгода; спрошенное в прошлом месяце
  // ставим в конец очереди, чтобы не крутить одни и те же три пункта.
  const { rows: history } = await pool.query(
    `SELECT month, items FROM monthly_checks WHERE company_id = $1 AND month < $2 ORDER BY month DESC LIMIT ${SKIP_MONTHS}`,
    [companyId, month]
  );
  const skipped = new Set();
  const askedLastMonth = new Set();
  history.forEach((h, idx) => {
    for (const it of h.items || []) {
      if (it.answer === 'skip') skipped.add(it.key);
      if (idx === 0) askedLastMonth.add(it.key);
    }
  });
  const queue = detailed
    .filter((v) => !skipped.has(`v:${v.id}`))
    .sort((a, b) => (askedLastMonth.has(`v:${a.id}`) - askedLastMonth.has(`v:${b.id}`)) || b.risk - a.risk);

  const items = [
    ...queue.slice(0, 3).map((v) => ({ key: `v:${v.id}`, type: 'violation', title: `«${v.title}» — исправили?`, hint: v.solution || null, risk: v.risk })),
    ...deadlines.map((d) => ({ key: `d:${d.id}`, type: 'deadline', title: `${d.title} — сделано?`, hint: d.due_date < today ? `Срок был ${d.due_date}` : `Срок ${d.due_date}`, overdue: d.due_date < today })),
    ...tasks.map((t) => ({ key: `t:${t.id}`, type: 'task', title: `Задача сети: ${t.title} — выполнена?`, hint: null })),
    ...regularFor(month).map((r) => ({ key: `r:${r.key}`, type: 'regular', title: r.title, hint: null })),
  ];
  return items.slice(0, MAX_ITEMS);
}

async function applyYes(item, { companyId, membershipId, userId }) {
  const id = Number(item.key.split(':')[1]);
  if (item.type === 'violation') {
    const { rowCount } = await pool.query(
      `UPDATE security_violations SET status = 'resolved', resolved_at = now(), resolved_by_membership_id = $1
       WHERE id = $2 AND company_id = $3 AND status = 'open'`,
      [membershipId, id, companyId]
    );
    if (rowCount) await clearAction({ relatedEntityType: 'security_violation', relatedEntityId: id, category: 'documents' });
  } else if (item.type === 'deadline') {
    const { rows } = await pool.query(
      `UPDATE deadlines SET status = 'done' WHERE id = $1 AND company_id = $2 AND status = 'pending'
       RETURNING recurrence, to_char(due_date, 'YYYY-MM-DD') AS due_date`,
      [id, companyId]
    );
    // Периодический срок — как «Готово» в разделе сроков: дата на следующий период.
    if (rows[0]?.recurrence && rows[0].due_date) {
      await pool.query(
        `UPDATE deadlines SET due_date = $1, status = 'pending', last_reminded_days_before = NULL WHERE id = $2`,
        [nextDueDate(rows[0].due_date, rows[0].recurrence), id]
      );
    }
  } else if (item.type === 'task') {
    await pool.query(
      `UPDATE franchise_task_points SET done_at = COALESCE(done_at, now()), done_by_user_id = $3
       WHERE task_id = $1 AND company_id = $2`,
      [id, companyId, userId]
    );
  }
}

// Итог: что стало лучше, что горит, план на месяц.
function bare(item) {
  return item.title.replace(/^«|» — исправили\?$|^Задача сети: | — (сделано|выполнена)\?$|\?$/g, '').replace(/ \(Только посмотрите — сюда не вносим\.\)$/, '');
}

const DONE_PREFIX = { violation: 'Исправлено', deadline: 'Сделано', task: 'Выполнена задача сети', regular: 'Проверено' };
const TODO_PREFIX = { violation: 'Исправить', deadline: 'Сделать', task: 'Выполнить задачу сети', regular: 'Проверить' };

function summarize(items, indexNow, indexPrev) {
  const yes = items.filter((i) => i.answer === 'yes');
  const no = items.filter((i) => i.answer === 'no');
  const burning = no.filter((i) => (i.type === 'violation' && i.risk >= 7) || (i.type === 'deadline' && i.overdue) || i.type === 'task');
  return {
    better: yes.map((i) => `${DONE_PREFIX[i.type]}: ${bare(i)}`),
    burning: burning.map((i) => `${TODO_PREFIX[i.type]}: ${bare(i)}`),
    // «Горит» уже в своём блоке — в плане не повторяем.
    plan: no.filter((i) => !burning.includes(i)).map((i) => `${TODO_PREFIX[i.type]}: ${bare(i)}`),
    // «Не получится» — риск остаётся, просто не спрашиваем полгода.
    accepted: items.filter((i) => i.answer === 'skip').map((i) => bare(i)),
    indexNow,
    indexPrev,
  };
}

async function getState(companyId) {
  const month = currentMonth();
  const { rows } = await pool.query(
    'SELECT month, items, index_percent, completed_at FROM monthly_checks WHERE company_id = $1 ORDER BY month DESC LIMIT 2',
    [companyId]
  );
  const done = rows.find((r) => r.month === month);
  const prev = rows.find((r) => r.month !== month);
  if (done) {
    return { month, done: true, completedAt: done.completed_at, summary: summarize(done.items, done.index_percent, prev?.index_percent ?? null) };
  }
  return { month, done: false, items: await buildItems(companyId, month), lastIndex: prev?.index_percent ?? null };
}

async function complete({ companyId, membershipId, userId, answers }) {
  const month = currentMonth();
  const items = await buildItems(companyId, month);
  const byKey = new Map((Array.isArray(answers) ? answers : []).map((a) => [a.key, a.answer]));
  // «Не получится» — только для нарушений: у сроков и задач сети есть свои кнопки.
  const answered = items.map((i) => {
    const a = byKey.get(i.key);
    const valid = ANSWERS.includes(a) && (a !== 'skip' || i.type === 'violation');
    return { ...i, answer: valid ? a : 'no' };
  });

  for (const item of answered) {
    if (item.answer === 'yes') await applyYes(item, { companyId, membershipId, userId });
  }
  const status = await computeSecurityStatus(companyId);
  const { rows: prev } = await pool.query(
    'SELECT index_percent FROM monthly_checks WHERE company_id = $1 AND month < $2 ORDER BY month DESC LIMIT 1',
    [companyId, month]
  );
  await pool.query(
    `INSERT INTO monthly_checks (company_id, month, items, index_percent, completed_by_user_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (company_id, month) DO UPDATE SET items = EXCLUDED.items, index_percent = EXCLUDED.index_percent,
       completed_at = now(), completed_by_user_id = EXCLUDED.completed_by_user_id`,
    [companyId, month, JSON.stringify(answered), status.indexPercent, userId]
  );
  // Напоминание «проверка месяца» в Центре действий больше не нужно.
  await clearAction({ relatedEntityType: `monthly_check:${month}`, relatedEntityId: companyId, category: 'documents' });
  return { month, done: true, summary: summarize(answered, status.indexPercent, prev[0]?.index_percent ?? null) };
}

module.exports = { currentMonth, buildItems, getState, complete, summarize, REGULAR };
