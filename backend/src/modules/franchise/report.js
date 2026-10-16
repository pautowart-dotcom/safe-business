// Ежемесячный отчёт франчайзеру (16.10.2026, этап 4 франшизы: Ф28/Ф52).
// Отчёт за месяц M: состояние на конец M (снимок на 1-е число M+1, а для
// текущего месяца — живое состояние) против снимка на начало M. Нет снимка
// на начало — сравнение честно не показываем. Ничего не досчитываем «на
// глаз»: события месяца (открытия, вступления, задачи) берём из БД по датам.
const pool = require('../../db/pool');
const { computeNetworkSummary } = require('./networkSummary');

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), label: `${MONTHS[m - 1]} ${y}` };
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function isMonth(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

// Что из сводки сохраняем в снимок — без имён, только числа по сети и
// индекс/зона по точкам (для «что стало лучше/хуже» по точкам).
function snapshotData(summary) {
  return {
    network: summary.network,
    points: summary.members.map((m) => ({ companyId: m.companyId, indexPercent: m.indexPercent, zone: m.zone, preparing: !!m.opening })),
  };
}

async function saveSnapshot(group, date) {
  const summary = await computeNetworkSummary(group);
  await pool.query(
    `INSERT INTO franchise_network_snapshots (franchise_group_id, snapshot_date, data) VALUES ($1, $2, $3)
     ON CONFLICT (franchise_group_id, snapshot_date) DO NOTHING`,
    [group.id, date, snapshotData(summary)]
  );
  return summary;
}

async function loadSnapshot(groupId, date) {
  const { rows } = await pool.query(
    'SELECT data FROM franchise_network_snapshots WHERE franchise_group_id = $1 AND snapshot_date = $2',
    [groupId, date]
  );
  return rows[0]?.data || null;
}

async function buildMonthlyReport(group, month = currentMonth()) {
  const { start, end, label } = monthBounds(month);
  const isCurrent = month === currentMonth();

  const before = await loadSnapshot(group.id, start);
  const live = await computeNetworkSummary(group);
  // Прошлый месяц — состояние на его конец из снимка; если снимка нет,
  // показываем текущее и честно подписываем это в отчёте.
  const afterSnapshot = isCurrent ? null : await loadSnapshot(group.id, end);
  const after = afterSnapshot || snapshotData(live);
  const afterIsLive = !afterSnapshot;

  const [openedRes, joinedRes, tasksRes] = await Promise.all([
    pool.query(
      `SELECT name, opened_at FROM companies WHERE franchise_group_id = $1 AND opened_at >= $2 AND opened_at < $3 ORDER BY opened_at`,
      [group.id, start, end]
    ),
    pool.query(
      `SELECT c.name, jr.decided_at FROM franchise_join_requests jr JOIN companies c ON c.id = jr.requesting_company_id
       WHERE jr.franchise_group_id = $1 AND jr.status = 'approved' AND jr.decided_at >= $2 AND jr.decided_at < $3
         AND c.franchise_group_id = $1 -- вышедшие из сети точки в отчётах не называем
       ORDER BY jr.decided_at`,
      [group.id, start, end]
    ),
    pool.query(
      `SELECT t.title, t.kind, count(tp.company_id)::int AS total, count(tp.done_at)::int AS done
       FROM franchise_tasks t LEFT JOIN franchise_task_points tp ON tp.task_id = t.id
       WHERE t.franchise_group_id = $1 AND t.created_at >= $2 AND t.created_at < $3
       GROUP BY t.id ORDER BY t.created_at`,
      [group.id, start, end]
    ),
  ]);

  // Точки, у которых индекс заметно изменился (только если есть оба значения).
  const changes = [];
  if (before) {
    const beforeById = new Map(before.points.map((p) => [p.companyId, p]));
    const names = new Map(live.members.map((m) => [m.companyId, m.companyName]));
    for (const p of after.points) {
      const b = beforeById.get(p.companyId);
      if (!b || b.indexPercent == null || p.indexPercent == null) continue;
      const delta = p.indexPercent - b.indexPercent;
      // Вышедшие из сети точки не показываем вовсе (выход = отзыв согласия).
      if (!names.has(p.companyId)) continue;
      if (Math.abs(delta) >= 5) changes.push({ companyName: names.get(p.companyId), from: b.indexPercent, to: p.indexPercent, delta });
    }
    changes.sort((a, b) => b.delta - a.delta);
  }

  return {
    month,
    label,
    isCurrent,
    afterIsLive,
    network: after.network,
    before: before ? before.network : null,
    improved: changes.filter((c) => c.delta > 0),
    worsened: changes.filter((c) => c.delta < 0),
    atRisk: live.members.filter((m) => m.riskReasons.length > 0).map((m) => ({ companyName: m.companyName, reasons: m.riskReasons })),
    preparing: live.members.filter((m) => m.opening).map((m) => ({ companyName: m.companyName, ...m.opening })),
    opened: openedRes.rows.map((r) => ({ companyName: r.name, date: r.opened_at })),
    joined: joinedRes.rows.map((r) => ({ companyName: r.name, date: r.decided_at })),
    tasks: tasksRes.rows,
  };
}

module.exports = { buildMonthlyReport, saveSnapshot, currentMonth, isMonth, monthBounds };
