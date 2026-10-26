require('dotenv').config();
const pool = require('../db/pool');
const { notifyCompany } = require('../core/notifications');
const { accessLevel } = require('../core/freeTier');
const { decrypt } = require('../core/crypto');
const svc = require('../modules/outside-watch/service');

// «Ваш бизнес снаружи» — наблюдение по подписке (22.10.2026), только свой
// бизнес клиента (по ИНН, который он подтвердил как свой). Раз в сутки:
// 1) снимок реестров по ИНН каждой компании с подпиской и сравнение с прошлым —
//    ухудшения уходят в «Уведомления», push и Telegram (только владельцу,
//    категория outside_watch);
// 2) 1-го числа ИП — напоминание проверить долги у приставов вручную
//    (по ИП автоматического источника нет, см. findings.js).
//
// Бесплатный лимит Checko защищён общим счётчиком (svc.reserveRequests): дошли — остальные
// компании ждут завтра (в лог), платный баланс без решения владельца не тратим.

async function watchedCompanies() {
  const { rows } = await pool.query(
    // Гостей теста (ИНН ввели на первом экране, пробный месяц = 'full') не
    // наблюдаем — иначе каждый гость весь месяц ел бы дневной лимит Checko.
    `SELECT c.id, c.is_test, c.outside_inn_enc FROM companies c
     WHERE c.outside_inn_enc IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.company_id = c.id AND m.role = 'owner' AND u.is_guest = true)
     ORDER BY c.id`
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
    try {
      const { row, prevSummary } = await svc.takeSnapshot(c.id, c.inn, 'watch');
      taken++;
      // Предстоящая проверка (26.10.2026) — своим событием «что подготовить»;
      // общее «появилась запись о проверке» тогда не дублируем.
      const inspectionEvents = await svc.inspectionEvents(c.id, row.summary);
      const diff = svc.diffSummaries(prevSummary, row.summary)
        .filter((ev) => !(inspectionEvents.length && ev.key.startsWith('count:inspections:')));
      for (const ev of [...inspectionEvents, ...diff]) {
        await notifyCompany({
          companyId: c.id, kind: 'outside_watch', category: 'outside_watch',
          title: ev.title, body: `${ev.body} Источник: открытые реестры через checko.ru.`, url: ev.url || '/outside',
          dedupeKey: `outside:${ev.key}`,
        }).catch((err) => console.error('outsideWatchDaily: notify failed', c.id, err));
        events++;
      }
    } catch (err) {
      if (err.code === 'BUDGET') {
        skippedCap = companies.length - companies.indexOf(c);
        break;
      }
      console.error('outsideWatchDaily: snapshot failed', c.id, err.code, err.message);
      if (err.code === 'NO_API_KEY') break;
    }
  }
  if (skippedCap) console.warn(`outsideWatchDaily: дневной лимит запросов к реестрам, отложено компаний: ${skippedCap}`);
  return { taken, events, skippedCap };
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
  const fssp = await runFsspReminder(companies);

  const note = `компаний ${companies.length}, снимков ${snap.taken}, событий ${snap.events}, отложено ${snap.skippedCap}, напоминаний ФССП ${fssp}`;
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
