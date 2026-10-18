require('dotenv').config();
const pool = require('../db/pool');
const { notifyCompany } = require('../core/notifications');
const { moscowDateStr } = require('../utils/moscowDate');
const { accessLevel } = require('../core/freeTier');

// Повторные напоминания о приближающихся сроках (05.09.2026) — closes a real
// gap: core/deadlines.js шлёт push РОВНО ОДИН РАЗ, в момент, когда владелец
// сам вписал дату (xmax=0 при INSERT). До этого скрипта ничего не напоминало
// повторно по мере приближения срока — сама суть "мы следим за сроками, вы
// можете не помнить" не работала на практике, только хранение списка.
//
// Пороги — дней ДО срока, ПО ВОЗРАСТАНИЮ (важно для .find ниже: нужен
// наименьший порог, который ещё не меньше daysUntil, то есть первое
// совпадение при переборе от меньшего к большему). last_reminded_days_before
// (миграция 0115) хранит наименьший уже отправленный порог — прогон шлёт
// повторно только когда наступает более близкий порог, не при каждом
// ежедневном запуске.
const THRESHOLDS = [0, 1, 7, 14, 30];

async function run() {
  const today = moscowDateStr(new Date());

  const { rows } = await pool.query(
    `SELECT id, company_id, category, title, to_char(due_date, 'YYYY-MM-DD') AS due_date, last_reminded_days_before
     FROM deadlines
     WHERE kind = 'deadline' AND status = 'pending' AND due_date IS NOT NULL AND due_date >= $1::date
       AND (snoozed_until IS NULL OR snoozed_until <= $1::date)
     ORDER BY due_date ASC`,
    [today]
  );

  let sent = 0;

  // «Напомнить позже» (миграция 0142): в назначенный день — одно
  // напоминание, отметка снимается, дальше срок живёт как обычно.
  const { rows: snoozed } = await pool.query(
    `UPDATE deadlines SET snoozed_until = NULL
     WHERE status = 'pending' AND snoozed_until IS NOT NULL AND snoozed_until <= $1::date
     RETURNING id, company_id, category, title, to_char(due_date, 'YYYY-MM-DD') AS due_date`,
    [today]
  );
  for (const row of snoozed) {
    const overdue = row.due_date && row.due_date < today;
    await notifyCompany({
      companyId: row.company_id, kind: 'deadline', category: row.category, title: row.title,
      body: overdue ? 'Вы просили напомнить. Срок уже прошёл — подробности в «Дедлайнах»' : 'Вы просили напомнить — подробности в «Дедлайнах»',
      url: '/deadlines',
      dedupeKey: `deadline:${row.id}`,
    }).catch((err) => console.error('deadlineReminders: snooze notify failed', row.id, err));
    sent++;
  }
  // Сегодня по этим срокам уже напомнили — не шлём второе уведомление подряд.
  const remindedNow = new Set(snoozed.map((r) => r.id));

  // Бесплатный уровень (core/freeTier.js): напоминание только в день срока,
  // заранее — по подписке. Уровень считаем один раз на компанию.
  const levels = new Map();
  async function levelOf(companyId) {
    if (!levels.has(companyId)) levels.set(companyId, await accessLevel(companyId));
    return levels.get(companyId);
  }

  for (const row of rows) {
    if (remindedNow.has(row.id)) continue;
    const daysUntil = Math.round((new Date(`${row.due_date}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
    const threshold = THRESHOLDS.find((t) => daysUntil <= t);
    if (threshold === undefined) continue;
    if (threshold > 0 && (await levelOf(row.company_id)) === 'free') continue;
    if (row.last_reminded_days_before !== null && row.last_reminded_days_before <= threshold) continue;

    await pool.query('UPDATE deadlines SET last_reminded_days_before = $1 WHERE id = $2', [threshold, row.id]);

    const body = daysUntil <= 0
      ? 'Срок наступает сегодня — подробности в «Дедлайнах»'
      : `Осталось ${daysUntil} дн. — подробности в «Дедлайнах»`;

    // Побочный эффект (push) не должен ронять весь прогон из-за одной
    // недоступной подписки — тот же принцип, что в core/deadlines.js.
    // dedupeKey по сроку: в разделе «Уведомления» одна запись на срок,
    // каждое следующее напоминание поднимает её наверх с новым «осталось N дн.».
    await notifyCompany({
      companyId: row.company_id, kind: 'deadline', category: row.category, title: row.title, body, url: '/deadlines',
      dedupeKey: `deadline:${row.id}`,
    }).catch((err) => console.error('deadlineReminders: notifyCompany failed', row.id, err));
    sent++;
  }

  await pool.query(
    `INSERT INTO cron_heartbeats (job_key, last_run_at, note) VALUES ('deadlineReminders', now(), $1)
     ON CONFLICT (job_key) DO UPDATE SET last_run_at = now(), note = $1`,
    [`проверено ${rows.length}, отправлено ${sent}`]
  );

  console.log(`deadlineReminders: проверено ${rows.length} сроков, отправлено ${sent} напоминаний`);
  await pool.end();
}

run().catch((err) => {
  console.error('deadlineReminders: fatal error', err);
  process.exit(1);
});
