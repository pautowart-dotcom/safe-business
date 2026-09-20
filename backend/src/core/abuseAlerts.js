// Сигналы о подозрительной активности владельцу платформы (20.09.2026, шаг 1
// защиты). Только уведомление, ничего не блокирует само: ложное срабатывание
// стоит одного пуша, а автоматическая блокировка могла бы ударить по
// реальным людям из воронки бесплатного теста.
const pool = require('../db/pool');
const { sendPushToSuperAdmins } = require('./pushNotify');

const GUEST_SPIKE_PER_HOUR = 25; // норма — единицы в день
let lastGuestSpikeAlertAt = 0; // на процесс; воркера два — не чаще ~2 пушей в час

async function checkGuestSpike() {
  if (Date.now() - lastGuestSpikeAlertAt < 60 * 60 * 1000) return;
  const { rows } = await pool.query(`SELECT COUNT(*) AS n FROM users WHERE is_guest = true AND created_at > now() - interval '1 hour'`);
  const n = Number(rows[0].n);
  if (n < GUEST_SPIKE_PER_HOUR) return;
  lastGuestSpikeAlertAt = Date.now();
  await sendPushToSuperAdmins({
    title: 'Всплеск гостевых тестов',
    body: `${n} гостевых аккаунтов за последний час — возможен автоматический обход`,
    url: '/office/companies',
  });
}

module.exports = { checkGuestSpike, GUEST_SPIKE_PER_HOUR };
