require('dotenv').config();
const pool = require('../db/pool');
const { saveSnapshot, monthBounds } = require('../modules/franchise/report');
const { notifyCompany } = require('../core/notifications');

// Ежемесячный снимок сети и уведомление франчайзеру (16.10.2026, этап 4
// франшизы: Ф28/Ф52). Крон каждый день в 05:30, работает только 1-го числа
// (по Москве): сохраняет снимок сводки каждой сети на это число и сообщает
// владельцу сети, что отчёт за прошлый месяц готов. Снимок за число не
// перезаписывается (ON CONFLICT DO NOTHING) — повторный запуск безопасен.
// Письмом отчёт уйдёт, когда будет почта (И1) — пока уведомление и push.
function moscowToday() {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

async function run() {
  const today = moscowToday();
  const force = process.argv.includes('--force');
  if (!force && !today.endsWith('-01')) {
    console.log(`franchiseMonthlySnapshot: ${today} — не 1-е число, пропуск`);
    await pool.end();
    return;
  }

  const prev = new Date(`${today}T00:00:00Z`);
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const prevMonth = prev.toISOString().slice(0, 7);
  const { label } = monthBounds(prevMonth);

  const { rows: groups } = await pool.query('SELECT id, name, owner_company_id FROM franchise_groups ORDER BY id');
  let saved = 0;
  for (const group of groups) {
    try {
      const summary = await saveSnapshot(group, today);
      saved++;
      const n = summary.network;
      await notifyCompany({
        companyId: group.owner_company_id,
        kind: 'network',
        title: `Отчёт по сети за ${label} готов`,
        body: `Точек: ${n.pointsTotal}, средний индекс: ${n.averageIndexPercent != null ? `${n.averageIndexPercent}%` : '—'}, требуют внимания: ${n.pointsAtRisk}.`,
        url: `/network-report?month=${prevMonth}`,
        dedupeKey: `franchise_report:${group.id}:${prevMonth}`,
      });
    } catch (err) {
      console.error('franchiseMonthlySnapshot: group failed', group.id, err);
    }
  }

  await pool.query(
    `INSERT INTO cron_heartbeats (job_key, last_run_at, note) VALUES ('franchiseMonthlySnapshot', now(), $1)
     ON CONFLICT (job_key) DO UPDATE SET last_run_at = now(), note = $1`,
    [`сетей: ${groups.length}, снимков: ${saved}`]
  );
  console.log(`franchiseMonthlySnapshot: сетей ${groups.length}, снимков ${saved}`);
  await pool.end();
}

run().catch((err) => {
  console.error('franchiseMonthlySnapshot: fatal error', err);
  process.exit(1);
});
