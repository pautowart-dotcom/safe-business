require('dotenv').config();
const pool = require('../db/pool');
const { notifyCompany } = require('../core/notifications');
const { accessLevel } = require('../core/freeTier');
const { decrypt } = require('../core/crypto');
const svc = require('../modules/outside-watch/service');
const { checkSelfEmployed, NPD_MIN_INTERVAL_MS } = require('../modules/outside-watch/npdClient');

// «Ваш бизнес снаружи» — наблюдение по подписке (22.10.2026). Раз в сутки:
// 1) снимок реестров по ИНН каждой компании с подпиской и сравнение с прошлым —
//    ухудшения уходят в «Уведомления», push и Telegram (только владельцу,
//    категория outside_watch);
// 2) раз в неделю — статус самозанятых мастеров (ФНС: не чаще 2 запросов
//    в минуту, поэтому идём по одному с паузой);
// 3) 1-го числа ИП — напоминание проверить долги у приставов вручную
//    (по ИП автоматического источника нет, см. findings.js).
//
// Бесплатный лимит Checko защищён svc.DAILY_SNAPSHOT_CAP: дошли — остальные
// компании ждут завтра (в лог), платный баланс без решения владельца не тратим.

const MASTER_RECHECK_DAYS = 7;
const MAX_MASTER_CHECKS_PER_RUN = 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function watchedCompanies() {
  const { rows } = await pool.query(
    `SELECT id, is_test, outside_inn_enc FROM companies WHERE outside_inn_enc IS NOT NULL ORDER BY id`
  );
  const out = [];
  for (const c of rows) {
    if (!svc.enabledFor(c)) continue;
    if ((await accessLevel(c.id)) !== 'full') continue;
    out.push({ id: c.id, inn: decrypt(c.outside_inn_enc) });
  }
  return out;
}

async function runSnapshots(companies) {
  let taken = 0;
  let events = 0;
  let skippedCap = 0;
  for (const c of companies) {
    const last = await svc.latestSnapshot(c.id);
    // Свежий снимок (например, бесплатный по кнопке сегодня) — не повторяем.
    if (last && last.summary?.inn === c.inn && Date.now() - new Date(last.created_at).getTime() < 20 * 3600 * 1000) continue;
    if ((await svc.snapshotsToday()) >= svc.DAILY_SNAPSHOT_CAP) {
      skippedCap++;
      continue;
    }
    try {
      const { row, prevSummary } = await svc.takeSnapshot(c.id, c.inn, 'watch');
      taken++;
      for (const ev of svc.diffSummaries(prevSummary, row.summary)) {
        await notifyCompany({
          companyId: c.id, kind: 'outside_watch', category: 'outside_watch',
          title: ev.title, body: `${ev.body} Источник: открытые реестры через checko.ru.`, url: '/outside',
          dedupeKey: `outside:${ev.key}`,
        }).catch((err) => console.error('outsideWatchDaily: notify failed', c.id, err));
        events++;
      }
    } catch (err) {
      console.error('outsideWatchDaily: snapshot failed', c.id, err.code, err.message);
      if (err.code === 'NO_API_KEY') break;
    }
  }
  if (skippedCap) console.warn(`outsideWatchDaily: дневной потолок снимков, отложено компаний: ${skippedCap}`);
  return { taken, events, skippedCap };
}

async function runMasters(companyIds) {
  if (!companyIds.length) return { checked: 0, lost: 0 };
  const { rows } = await pool.query(
    `SELECT id, company_id, label, inn_enc, last_status FROM outside_watch_masters
     WHERE company_id = ANY($1) AND (last_checked_at IS NULL OR last_checked_at < now() - make_interval(days => $2))
     ORDER BY last_checked_at NULLS FIRST LIMIT $3`,
    [companyIds, MASTER_RECHECK_DAYS, MAX_MASTER_CHECKS_PER_RUN]
  );
  let checked = 0;
  let lost = 0;
  for (const [i, m] of rows.entries()) {
    if (i > 0) await sleep(NPD_MIN_INTERVAL_MS);
    try {
      const r = await checkSelfEmployed(decrypt(m.inn_enc));
      await pool.query('UPDATE outside_watch_masters SET last_status = $2, last_checked_at = now() WHERE id = $1', [m.id, r.status]);
      checked++;
      if (m.last_status !== false && r.status === false) {
        lost++;
        await notifyCompany({
          companyId: m.company_id, kind: 'outside_watch', category: 'outside_watch',
          title: `${m.label}: ФНС не видит статуса самозанятого`,
          body: 'Если продолжать платить как самозанятому, налоговая может посчитать это трудовыми отношениями. Уточните у мастера и проверьте на npd.nalog.ru. Источник: ФНС.',
          url: '/outside',
          dedupeKey: `outside:npd:${m.id}`,
        }).catch((err) => console.error('outsideWatchDaily: notify failed', m.company_id, err));
      }
    } catch (err) {
      console.error('outsideWatchDaily: npd check failed', m.id, err.code, err.message);
      if (err.code === 'RATE_LIMIT') break;
    }
  }
  return { checked, lost };
}

async function runFsspReminder(companies) {
  const now = new Date();
  if (now.getUTCDate() !== 1) return 0;
  const month = now.toISOString().slice(0, 7);
  let sent = 0;
  for (const c of companies) {
    if (c.inn.length !== 12) continue; // у организаций приставы проверяются автоматически
    await notifyCompany({
      companyId: c.id, kind: 'outside_watch', category: 'outside_watch',
      title: 'Проверьте долги у приставов — 1 минута',
      body: 'По ИП реестр приставов автоматически не читается. Откройте Госуслуги («Задолженности») или fssp.gov.ru и найдите себя по ФИО и региону.',
      url: '/outside',
      dedupeKey: `outside:fssp:${month}`,
    }).catch((err) => console.error('outsideWatchDaily: notify failed', c.id, err));
    sent++;
  }
  return sent;
}

async function run() {
  const companies = await watchedCompanies();
  const snap = await runSnapshots(companies);
  const masters = await runMasters(companies.map((c) => c.id));
  const fssp = await runFsspReminder(companies);

  const note = `компаний ${companies.length}, снимков ${snap.taken}, событий ${snap.events}, отложено ${snap.skippedCap}, мастеров ${masters.checked} (потеряли статус ${masters.lost}), напоминаний ФССП ${fssp}`;
  await pool.query(
    `INSERT INTO cron_heartbeats (job_key, last_run_at, note) VALUES ('outsideWatchDaily', now(), $1)
     ON CONFLICT (job_key) DO UPDATE SET last_run_at = now(), note = $1`,
    [note]
  );
  console.log(`outsideWatchDaily: ${note}`);
  await pool.end();
}

run().catch((err) => {
  console.error('outsideWatchDaily: fatal error', err);
  process.exit(1);
});
