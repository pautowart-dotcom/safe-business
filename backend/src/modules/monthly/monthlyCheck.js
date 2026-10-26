// Проверка месяца (17.10.2026, этап 7, миграция 0140). Вопросы собираются
// из данных самой точки — новый контент под 37 ниш не нужен:
//   1) до 3 самых рискованных открытых нарушений — «„…“ — исправили?»;
//   2) до 2 сроков на ближайшие 30 дней (или подошедших) — «сделали?»;
//   3) до 2 невыполненных задач сети, если точка в сети;
//   4) регулярные вещи со своей частотой — остальные места до 7, не меньше 2.
// Не больше 7 вопросов. Ответ «да» сразу закрывает нарушение / срок /
// задачу — той же логикой, что кнопки в кабинете.
//
// Подписка без дат (26.10.2026, docs/plan-2026-10-26.md, шаг 1, решения
// владельца): регулярные вопросы — по нише и ответам теста, частота — из наших
// инструкций (content/instructions, сверены с законом). «Да» запускает цикл:
// вопрос вернётся через свою частоту, считая от сегодня или от даты, которую
// человек по желанию указал сам. «Ещё нет» — просто напоминание: спросим в
// следующем месяце, индекс не снижаем. Огнетушители — раз в квартал, после
// перезарядки владелец может сделать реже. Не помещается в 7 — переносится.
const pool = require('../../db/pool');
const repository = require('../security/content/repository');
const { clearAction, nextDueDate } = require('../../core/deadlines');
const { computeSecurityStatus } = require('../security/status');
const { loadProfile } = require('../security/profile');
const { isVisible } = require('../../core/profileVisibility');
const { moscowDateStr } = require('../../utils/moscowDate');

const MAX_ITEMS = 7;
const MIN_REGULAR = 2;
const SKIP_MONTHS = 6;
const ANSWERS = ['yes', 'no', 'skip'];

const STERILIZATION = ['Журнал стерилизации', 'Контроль качества стерилизации', 'Стерилизация инструмента для чистки лица', 'Стерилизация многоразового инструмента (автоклав/сухожар)'];

// Без статей и сумм: это повод посмотреть, а не новое «нарушение».
// titles — пункты матрицы нарушений ниши, при которых вопрос нужен (null — всем);
// showIf — правило профиля из core/profileVisibility.js; every — раз в N месяцев.
// Порядок = приоритет, когда в 7 вопросов всё не помещается.
const REGULAR = [
  { key: 'sterilization', every: 1, instruction: 'sterilizaciya', titles: STERILIZATION, title: 'Журнал стерилизации заполнен за все дни прошлого месяца?' },
  { key: 'general_cleaning', every: 1, instruction: 'uborka', titles: ['График генеральных уборок', 'Журнал уборки'], title: 'Генеральная уборка была каждую неделю по графику?' },
  { key: 'pest_control', every: 1, instruction: 'dogovory-musor-dezinsekciya', titles: ['Дезинсекция и дератизация'], title: 'Дезинсекция приходила по договору (осмотр не реже 2 раз в месяц), акты есть?' },
  { key: 'waste_b', every: 1, instruction: 'dogovory-musor-dezinsekciya', titles: ['Отходы класса Б'], title: 'Отходы класса Б вывезли по договору, акт есть?' },
  { key: 'fire_ext', every: 3, everyOptions: [3, 6, 12], instruction: 'ognetushiteli', titles: null, title: 'Огнетушители осмотрены по паспорту: на месте, пломба цела, стрелка в зелёной зоне?' },
  { key: 'staff_books', every: 3, instruction: 'medknizhki', titles: null, showIf: 'has_employees', title: 'Медкнижки: ни у кого не подходит срок медосмотра? (Только посмотрите — даты сюда не вносим.)' },
  { key: 'ot_briefing', every: 6, instruction: 'instruktazh-ohrana-truda', titles: ['Инструктаж по охране труда'], showIf: 'has_employees', title: 'Повторный инструктаж по охране труда провели в последние 6 месяцев?' },
  { key: 'sterilizer_ppk', every: 6, instruction: 'proizvodstvennyj-kontrol', titles: STERILIZATION, title: 'Проверку стерилизатора по программе производственного контроля делали в последние 6 месяцев?' },
  { key: 'consumer_corner', every: 3, instruction: null, titles: null, title: 'Уголок потребителя актуален: цены, режим работы, контакты?' },
  { key: 'fire_briefing', every: 12, instruction: 'instruktazh-pozharnyj', titles: ['Инструкция о мерах пожарной безопасности'], showIf: 'has_employees', title: 'Повторный противопожарный инструктаж со всеми был в последние 12 месяцев?' },
  { key: 'light_ppk', every: 12, instruction: 'proizvodstvennyj-kontrol', titles: STERILIZATION, title: 'Замер освещённости по программе производственного контроля был в последние 12 месяцев?' },
  { key: 'first_aid', every: 6, instruction: null, titles: null, title: 'Аптечка полная, сроки годности не вышли?' },
];

function currentMonth() {
  return moscowDateStr(new Date()).slice(0, 7);
}

function monthNo(ym) {
  return Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
}

// Вопросы, которые нужны этой точке: по нише (titles) и профилю (showIf).
// Без профиля (теста не было) — только общие, без правил профиля.
function relevantRegular(profile, nicheTitles) {
  return REGULAR.filter((r) => {
    if (r.showIf && (!profile || !isVisible(r.showIf, profile))) return false;
    return !r.titles || r.titles.some((t) => nicheTitles.has(t));
  });
}

// Пора ли спросить: ни разу не отвечали «да» или прошла своя частота.
function dueRegular(relevant, stateByKey, month) {
  return relevant.filter((r) => {
    const s = stateByKey.get(r.key);
    if (!s?.last_done) return true;
    return monthNo(month) - monthNo(s.last_done) >= (s.every_months || r.every);
  });
}

function everyLabel(n) {
  if (n === 1) return 'Каждый месяц';
  if (n === 12) return 'Раз в год';
  return `Раз в ${n} месяц${n < 5 ? 'а' : 'ев'}`;
}

function regularItem(r, s) {
  const every = s?.every_months || r.every;
  return {
    key: `r:${r.key}`,
    type: 'regular',
    title: r.title,
    hint: everyLabel(every),
    every,
    everyOptions: r.everyOptions || null,
    instruction: r.instruction,
    lastDone: s?.last_done || null,
  };
}

async function buildItems(companyId, month = currentMonth()) {
  const today = moscowDateStr(new Date());
  const profile = await loadProfile(companyId);
  const nicheTitles = new Set();
  for (const niche of profile?.niches || []) {
    for (const v of (await repository.getViolationMatrix(niche)) || []) nicheTitles.add(v.title);
  }
  const { rows: regularState } = await pool.query(
    `SELECT item_key, to_char(last_done, 'YYYY-MM-DD') AS last_done, every_months FROM monthly_regular_state WHERE company_id = $1`,
    [companyId]
  );
  const stateByKey = new Map(regularState.map((s) => [s.item_key, s]));
  const dueRegularList = dueRegular(relevantRegular(profile, nicheTitles), stateByKey, month);

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

  // Не спрошенное в прошлом месяце — вперёд, чтобы редкие вопросы не
  // застревали за ежемесячными (sort стабильный — внутри порядок REGULAR).
  const dueRegularItems = dueRegularList
    .sort((a, b) => askedLastMonth.has(`r:${a.key}`) - askedLastMonth.has(`r:${b.key}`))
    .map((r) => regularItem(r, stateByKey.get(r.key)));

  const own = [
    ...queue.slice(0, 3).map((v) => ({ key: `v:${v.id}`, type: 'violation', title: `«${v.title}» — исправили?`, hint: v.solution || null, risk: v.risk })),
    ...deadlines.map((d) => ({ key: `d:${d.id}`, type: 'deadline', title: `${d.title} — сделано?`, hint: d.due_date < today ? `Срок был ${d.due_date}` : `Срок ${d.due_date}`, overdue: d.due_date < today })),
    ...tasks.map((t) => ({ key: `t:${t.id}`, type: 'task', title: `Задача сети: ${t.title} — выполнена?`, hint: null })),
  ];
  return pickItems(own, dueRegularItems);
}

// Регулярным — свободные места до 7, но не меньше 2; что не влезло, спросим
// в следующем месяце (оно так и останется «пора»).
function pickItems(own, regular) {
  const regularPick = regular.slice(0, Math.max(MIN_REGULAR, MAX_ITEMS - own.length));
  return [...own.slice(0, MAX_ITEMS - regularPick.length), ...regularPick];
}

// «Когда было» — по желанию: не в будущем и не старше двух лет, иначе сегодня.
function doneDate(date, today) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return today;
  const minDate = `${Number(today.slice(0, 4)) - 2}${today.slice(4)}`;
  return date <= today && date >= minDate ? date : today;
}

async function applyRegular(item, { companyId, date, every }) {
  const key = item.key.slice(2);
  const ownEvery = item.everyOptions?.includes(every) ? every : null;
  if (item.answer !== 'yes' && !ownEvery) return;
  const lastDone = item.answer === 'yes' ? doneDate(date, moscowDateStr(new Date())) : null;
  await pool.query(
    `INSERT INTO monthly_regular_state (company_id, item_key, last_done, every_months)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (company_id, item_key) DO UPDATE SET
       last_done = COALESCE(EXCLUDED.last_done, monthly_regular_state.last_done),
       every_months = COALESCE(EXCLUDED.every_months, monthly_regular_state.every_months),
       updated_at = now()`,
    [companyId, key, lastDone, ownEvery]
  );
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
  return item.title.replace(/ \(Только посмотрите[^)]*\)$/, '').replace(/^«|» — исправили\?$|^Задача сети: | — (сделано|выполнена)\?$|\?$/g, '');
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
  const byKey = new Map((Array.isArray(answers) ? answers : []).map((a) => [a?.key, a]));
  // «Не получится» — только для нарушений: у сроков и задач сети есть свои кнопки.
  const answered = items.map((i) => {
    const a = byKey.get(i.key)?.answer;
    const valid = ANSWERS.includes(a) && (a !== 'skip' || i.type === 'violation');
    return { ...i, answer: valid ? a : 'no' };
  });

  for (const item of answered) {
    if (item.type === 'regular') {
      const { date, every } = byKey.get(item.key) || {};
      await applyRegular(item, { companyId, date, every: Number(every) || null });
    } else if (item.answer === 'yes') {
      await applyYes(item, { companyId, membershipId, userId });
    }
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

module.exports = { currentMonth, buildItems, getState, complete, summarize, REGULAR, relevantRegular, dueRegular, pickItems, doneDate };
