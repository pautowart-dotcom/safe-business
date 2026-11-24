// Напоминание про один незакрытый пункт (24.11.2026). Не каждый день:
// повтор не раньше чем через 3 дня, и только пока кабинет открыт
// (пробный период, подписка или подарок). «Хватит» в боте останавливает.
// Канал — один: обычное уведомление, если оно уже разрешено, иначе бот.
//
// Отдельной строки cron нет: вызывается из dailyOperationsNudges.js.
// Запуск вручную: node src/scripts/stepReminders.js
require('dotenv').config();
const pool = require('../db/pool');
const { accessLevel } = require('../core/freeTier');
const { notifyCompany } = require('../core/notifications');
const { nextOpenStep } = require('../modules/security/nextStep');

const GAP_MS = 3 * 24 * 60 * 60 * 1000;

async function stopForUser(userId) {
  const { rows } = await pool.query(
    `SELECT company_id FROM memberships
     WHERE user_id = $1 AND active = true AND invite_status = 'active' AND role IN ('owner', 'admin')`,
    [userId]
  );
  for (const row of rows) {
    await pool.query(
      `INSERT INTO step_reminders (company_id, stopped_at) VALUES ($1, now())
       ON CONFLICT (company_id) DO UPDATE SET stopped_at = now()`,
      [row.company_id]
    );
  }
}

async function resumeForUser(userId) {
  const { rows } = await pool.query(
    `SELECT company_id FROM memberships
     WHERE user_id = $1 AND active = true AND invite_status = 'active' AND role IN ('owner', 'admin')`,
    [userId]
  );
  for (const row of rows) {
    await pool.query(
      `INSERT INTO step_reminders (company_id, stopped_at) VALUES ($1, NULL)
       ON CONFLICT (company_id) DO UPDATE SET stopped_at = NULL`,
      [row.company_id]
    );
  }
}

async function stopped(companyId) {
  const { rows } = await pool.query('SELECT stopped_at FROM step_reminders WHERE company_id = $1', [companyId]);
  return !!rows[0]?.stopped_at;
}

async function run() {
  const { rows } = await pool.query(
    `SELECT DISTINCT v.company_id
     FROM security_violations v
     JOIN companies c ON c.id = v.company_id
     WHERE v.status = 'open' AND c.is_test IS NOT TRUE`
  );
  let sent = 0;
  for (const { company_id: companyId } of rows) {
    if ((await accessLevel(companyId)) !== 'full') continue;
    const { rows: state } = await pool.query(
      'SELECT last_sent_at, stopped_at FROM step_reminders WHERE company_id = $1',
      [companyId]
    );
    if (state[0]?.stopped_at) continue;
    if (state[0]?.last_sent_at && Date.now() - new Date(state[0].last_sent_at).getTime() < GAP_MS) continue;
    const step = await nextOpenStep(companyId);
    if (!step) continue;
    await notifyCompany({
      companyId,
      kind: 'other',
      category: 'documents',
      title: `Сейчас один пункт: ${step.title}`,
      body: 'Откройте кабинет и отметьте «Сделано», когда закроете. Если эти напоминания не нужны, напишите боту «хватит».',
      url: '/security',
      dedupeKey: `step:${companyId}`,
      channels: 'one',
    });
    await pool.query(
      `INSERT INTO step_reminders (company_id, violation_id, last_sent_at) VALUES ($1, $2, now())
       ON CONFLICT (company_id) DO UPDATE SET violation_id = $2, last_sent_at = now()`,
      [companyId, step.id]
    );
    sent += 1;
  }
  return sent;
}

module.exports = { run, stopForUser, resumeForUser, stopped };

if (require.main === module) {
  run()
    .then((n) => { console.log(`stepReminders: отправлено ${n}`); return pool.end(); })
    .catch((err) => { console.error('stepReminders упал:', err); pool.end().finally(() => process.exit(1)); });
}
