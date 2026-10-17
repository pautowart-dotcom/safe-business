// РџСЂРѕРІРµСЂРєР° РјРµСЃСЏС†Р° (17.10.2026, СЌС‚Р°Рї 7, РјРёРіСЂР°С†РёСЏ 0140). Р’РѕРїСЂРѕСЃС‹ СЃРѕР±РёСЂР°СЋС‚СЃСЏ
// РёР· РґР°РЅРЅС‹С… СЃР°РјРѕР№ С‚РѕС‡РєРё вЂ” РЅРѕРІС‹Р№ РєРѕРЅС‚РµРЅС‚ РїРѕРґ 37 РЅРёС€ РЅРµ РЅСѓР¶РµРЅ:
//   1) РґРѕ 3 СЃР°РјС‹С… СЂРёСЃРєРѕРІР°РЅРЅС‹С… РѕС‚РєСЂС‹С‚С‹С… РЅР°СЂСѓС€РµРЅРёР№ вЂ” В«вЂћвЂ¦вЂњ вЂ” РёСЃРїСЂР°РІРёР»Рё?В»;
//   2) РґРѕ 2 СЃСЂРѕРєРѕРІ РЅР° Р±Р»РёР¶Р°Р№С€РёРµ 30 РґРЅРµР№ (РёР»Рё РїРѕРґРѕС€РµРґС€РёС…) вЂ” В«СЃРґРµР»Р°Р»Рё?В»;
//   3) РґРѕ 2 РЅРµРІС‹РїРѕР»РЅРµРЅРЅС‹С… Р·Р°РґР°С‡ СЃРµС‚Рё, РµСЃР»Рё С‚РѕС‡РєР° РІ СЃРµС‚Рё;
//   4) 2 СЂРµРіСѓР»СЏСЂРЅС‹Рµ РІРµС‰Рё, РѕР±С‰РёРµ РґР»СЏ РІСЃРµС… (РјРµРЅСЏСЋС‚СЃСЏ РїРѕ РјРµСЃСЏС†Р°Рј).
// РќРµ Р±РѕР»СЊС€Рµ 7 РІРѕРїСЂРѕСЃРѕРІ. РћС‚РІРµС‚ В«РґР°В» СЃСЂР°Р·Сѓ Р·Р°РєСЂС‹РІР°РµС‚ РЅР°СЂСѓС€РµРЅРёРµ / СЃСЂРѕРє /
// Р·Р°РґР°С‡Сѓ вЂ” С‚РѕР№ Р¶Рµ Р»РѕРіРёРєРѕР№, С‡С‚Рѕ РєРЅРѕРїРєРё РІ РєР°Р±РёРЅРµС‚Рµ.
const pool = require('../../db/pool');
const repository = require('../security/content/repository');
const { clearAction, nextDueDate } = require('../../core/deadlines');
const { computeSecurityStatus } = require('../security/status');
const { moscowDateStr } = require('../../utils/moscowDate');

const MAX_ITEMS = 7;
const SKIP_MONTHS = 6;
const ANSWERS = ['yes', 'no', 'skip'];

// Р‘РµР· СЃС‚Р°С‚РµР№ Рё СЃСѓРјРј: СЌС‚Рѕ РїРѕРІРѕРґ РїРѕСЃРјРѕС‚СЂРµС‚СЊ, Р° РЅРµ РЅРѕРІРѕРµ В«РЅР°СЂСѓС€РµРЅРёРµВ».
const REGULAR = [
  { key: 'fire_ext', title: 'РћРіРЅРµС‚СѓС€РёС‚РµР»Рё РЅР° РјРµСЃС‚Рµ, РїР»РѕРјР±Р° С†РµР»Р°, СЃС‚СЂРµР»РєР° РјР°РЅРѕРјРµС‚СЂР° РІ Р·РµР»С‘РЅРѕР№ Р·РѕРЅРµ?' },
  { key: 'first_aid', title: 'РђРїС‚РµС‡РєР° РїРѕР»РЅР°СЏ, СЃСЂРѕРєРё РіРѕРґРЅРѕСЃС‚Рё РЅРµ РІС‹С€Р»Рё?' },
  { key: 'consumer_corner', title: 'РЈРіРѕР»РѕРє РїРѕС‚СЂРµР±РёС‚РµР»СЏ Р°РєС‚СѓР°Р»РµРЅ: С†РµРЅС‹, СЂРµР¶РёРј СЂР°Р±РѕС‚С‹, РєРѕРЅС‚Р°РєС‚С‹?' },
  { key: 'evacuation', title: 'РџСѓС‚Рё СЌРІР°РєСѓР°С†РёРё СЃРІРѕР±РѕРґРЅС‹, С‚Р°Р±Р»РёС‡РєР° В«Р’С‹С…РѕРґВ» РІРёРґРЅР°?' },
  { key: 'client_docs', title: 'РЈ РЅРѕРІС‹С… РєР»РёРµРЅС‚РѕРІ РїРѕРґРїРёСЃР°РЅС‹ РґРѕРіРѕРІРѕСЂ Рё СЃРѕРіР»Р°СЃРёРµ РЅР° РѕР±СЂР°Р±РѕС‚РєСѓ РґР°РЅРЅС‹С…?' },
  { key: 'staff_books', title: 'РњРµРґРєРЅРёР¶РєРё СЃРѕС‚СЂСѓРґРЅРёРєРѕРІ РЅРµ РїСЂРѕСЃСЂРѕС‡РµРЅС‹? (РўРѕР»СЊРєРѕ РїРѕСЃРјРѕС‚СЂРёС‚Рµ вЂ” СЃСЋРґР° РЅРµ РІРЅРѕСЃРёРј.)' },
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
  // Р§РµСЂРµРґРѕРІР°РЅРёРµ Рё В«РќРµ РїРѕР»СѓС‡РёС‚СЃСЏВ» (17.10.2026, РІР»Р°РґРµР»РµС†: В«РїРѕРґРјРµРЅСѓ С‚СЂСѓРґРѕРІС‹С…
  // РѕС‚РЅРѕС€РµРЅРёР№ РјР°Р»С‹Р№ Р±РёР·РЅРµСЃ РґРѕ РєРѕРЅС†Р° РЅРµ РёСЃРїСЂР°РІРёС‚В»): РЅР°СЂСѓС€РµРЅРёРµ СЃ РѕС‚РІРµС‚РѕРј
  // В«РќРµ РїРѕР»СѓС‡РёС‚СЃСЏВ» РЅРµ СЃРїСЂР°С€РёРІР°РµРј РїРѕР»РіРѕРґР°; СЃРїСЂРѕС€РµРЅРЅРѕРµ РІ РїСЂРѕС€Р»РѕРј РјРµСЃСЏС†Рµ
  // СЃС‚Р°РІРёРј РІ РєРѕРЅРµС† РѕС‡РµСЂРµРґРё, С‡С‚РѕР±С‹ РЅРµ РєСЂСѓС‚РёС‚СЊ РѕРґРЅРё Рё С‚Рµ Р¶Рµ С‚СЂРё РїСѓРЅРєС‚Р°.
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
    ...queue.slice(0, 3).map((v) => ({ key: `v:${v.id}`, type: 'violation', title: `В«${v.title}В» вЂ” РёСЃРїСЂР°РІРёР»Рё?`, hint: v.solution || null, risk: v.risk })),
    ...deadlines.map((d) => ({ key: `d:${d.id}`, type: 'deadline', title: `${d.title} вЂ” СЃРґРµР»Р°РЅРѕ?`, hint: d.due_date < today ? `РЎСЂРѕРє Р±С‹Р» ${d.due_date}` : `РЎСЂРѕРє ${d.due_date}`, overdue: d.due_date < today })),
    ...tasks.map((t) => ({ key: `t:${t.id}`, type: 'task', title: `Р—Р°РґР°С‡Р° СЃРµС‚Рё: ${t.title} вЂ” РІС‹РїРѕР»РЅРµРЅР°?`, hint: null })),
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
    // РџРµСЂРёРѕРґРёС‡РµСЃРєРёР№ СЃСЂРѕРє вЂ” РєР°Рє В«Р“РѕС‚РѕРІРѕВ» РІ СЂР°Р·РґРµР»Рµ СЃСЂРѕРєРѕРІ: РґР°С‚Р° РЅР° СЃР»РµРґСѓСЋС‰РёР№ РїРµСЂРёРѕРґ.
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

// РС‚РѕРі: С‡С‚Рѕ СЃС‚Р°Р»Рѕ Р»СѓС‡С€Рµ, С‡С‚Рѕ РіРѕСЂРёС‚, РїР»Р°РЅ РЅР° РјРµСЃСЏС†.
function bare(item) {
  return item.title.replace(/^В«|В» вЂ” РёСЃРїСЂР°РІРёР»Рё\?$|^Р—Р°РґР°С‡Р° СЃРµС‚Рё: | вЂ” (СЃРґРµР»Р°РЅРѕ|РІС‹РїРѕР»РЅРµРЅР°)\?$|\?$/g, '').replace(/ \(РўРѕР»СЊРєРѕ РїРѕСЃРјРѕС‚СЂРёС‚Рµ вЂ” СЃСЋРґР° РЅРµ РІРЅРѕСЃРёРј\.\)$/, '');
}

const DONE_PREFIX = { violation: 'РСЃРїСЂР°РІР»РµРЅРѕ', deadline: 'РЎРґРµР»Р°РЅРѕ', task: 'Р’С‹РїРѕР»РЅРµРЅР° Р·Р°РґР°С‡Р° СЃРµС‚Рё', regular: 'РџСЂРѕРІРµСЂРµРЅРѕ' };
const TODO_PREFIX = { violation: 'РСЃРїСЂР°РІРёС‚СЊ', deadline: 'РЎРґРµР»Р°С‚СЊ', task: 'Р’С‹РїРѕР»РЅРёС‚СЊ Р·Р°РґР°С‡Сѓ СЃРµС‚Рё', regular: 'РџСЂРѕРІРµСЂРёС‚СЊ' };

function summarize(items, indexNow, indexPrev) {
  const yes = items.filter((i) => i.answer === 'yes');
  const no = items.filter((i) => i.answer === 'no');
  const burning = no.filter((i) => (i.type === 'violation' && i.risk >= 7) || (i.type === 'deadline' && i.overdue) || i.type === 'task');
  return {
    better: yes.map((i) => `${DONE_PREFIX[i.type]}: ${bare(i)}`),
    burning: burning.map((i) => `${TODO_PREFIX[i.type]}: ${bare(i)}`),
    // В«Р“РѕСЂРёС‚В» СѓР¶Рµ РІ СЃРІРѕС‘Рј Р±Р»РѕРєРµ вЂ” РІ РїР»Р°РЅРµ РЅРµ РїРѕРІС‚РѕСЂСЏРµРј.
    plan: no.filter((i) => !burning.includes(i)).map((i) => `${TODO_PREFIX[i.type]}: ${bare(i)}`),
    // В«РќРµ РїРѕР»СѓС‡РёС‚СЃСЏВ» вЂ” СЂРёСЃРє РѕСЃС‚Р°С‘С‚СЃСЏ, РїСЂРѕСЃС‚Рѕ РЅРµ СЃРїСЂР°С€РёРІР°РµРј РїРѕР»РіРѕРґР°.
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
  // В«РќРµ РїРѕР»СѓС‡РёС‚СЃСЏВ» вЂ” С‚РѕР»СЊРєРѕ РґР»СЏ РЅР°СЂСѓС€РµРЅРёР№: Сѓ СЃСЂРѕРєРѕРІ Рё Р·Р°РґР°С‡ СЃРµС‚Рё РµСЃС‚СЊ СЃРІРѕРё РєРЅРѕРїРєРё.
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
  // РќР°РїРѕРјРёРЅР°РЅРёРµ В«РїСЂРѕРІРµСЂРєР° РјРµСЃСЏС†Р°В» РІ Р¦РµРЅС‚СЂРµ РґРµР№СЃС‚РІРёР№ Р±РѕР»СЊС€Рµ РЅРµ РЅСѓР¶РЅРѕ.
  await clearAction({ relatedEntityType: `monthly_check:${month}`, relatedEntityId: companyId, category: 'documents' });
  return { month, done: true, summary: summarize(answered, status.indexPercent, prev[0]?.index_percent ?? null) };
}

module.exports = { currentMonth, buildItems, getState, complete, summarize, REGULAR };
