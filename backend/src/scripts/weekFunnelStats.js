// Метрики воронки за N дней → цифры для SCOREBOARD.md (90 дней продаж).
// Не шлёт письма. Не печатает email/токены.
// Запуск на сервере или локально с backend/.env:
//   node src/scripts/weekFunnelStats.js
//   node src/scripts/weekFunnelStats.js 14
require('dotenv').config();
const pool = require('../db/pool');

async function one(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0];
}

async function run(days) {
  const d = Math.max(1, Math.min(90, Number(days) || 7));
  const started = await one(
    `SELECT COUNT(*)::int AS n FROM security_sessions
     WHERE started_at > now() - ($1 || ' days')::interval`,
    [String(d)]
  );
  const completed = await one(
    `SELECT COUNT(*)::int AS n FROM security_sessions
     WHERE status = 'completed'
       AND COALESCE(completed_at, started_at) > now() - ($1 || ' days')::interval`,
    [String(d)]
  );
  const inProgress = await one(
    `SELECT COUNT(*)::int AS n FROM security_sessions
     WHERE status = 'in_progress'
       AND started_at > now() - ($1 || ' days')::interval`,
    [String(d)]
  );
  const addons = await one(
    `SELECT COUNT(*)::int AS n,
            COALESCE(SUM(amount_rub), 0)::int AS rub
     FROM addon_purchases
     WHERE status = 'succeeded'
       AND COALESCE(confirmed_at, created_at) > now() - ($1 || ' days')::interval`,
    [String(d)]
  );
  const subs = await one(
    `SELECT COUNT(*)::int AS n,
            COALESCE(SUM(amount_rub), 0)::int AS rub
     FROM subscription_payments
     WHERE status = 'succeeded'
       AND COALESCE(confirmed_at, created_at) > now() - ($1 || ' days')::interval`,
    [String(d)]
  );
  const chatMastersUtm = await one(
    `SELECT COUNT(*)::int AS n FROM landing_visits
     WHERE created_at > now() - ($1 || ' days')::interval
       AND utm_source = 'chat_masters'`,
    [String(d)]
  );
  const followupDone = await one(
    `SELECT COUNT(*)::int AS n FROM users
     WHERE result_followup_sent_at > now() - ($1 || ' days')::interval`,
    [String(d)]
  );
  let incompleteCol = null;
  try {
    incompleteCol = await one(
      `SELECT COUNT(*)::int AS n FROM users
       WHERE incomplete_audit_followup_sent_at > now() - ($1 || ' days')::interval`,
      [String(d)]
    );
  } catch (_) {
    incompleteCol = { n: null };
  }

  const lines = [
    `=== Воронка за ${d} дн. (${new Date().toISOString().slice(0, 10)}) ===`,
    `Начатых тестов:     ${started.n}`,
    `Завершённых тестов: ${completed.n}`,
    `В процессе:         ${inProgress.n}`,
    `Оплат addon:        ${addons.n} на ${addons.rub} ₽`,
    `Оплат подписки:     ${subs.n} на ${subs.rub} ₽`,
    `Выручка сумма:      ${addons.rub + subs.rub} ₽`,
    `UTM chat_masters:   ${chatMastersUtm.n} визитов лендинга`,
    `Дожим после теста:  ${followupDone.n} писем`,
    incompleteCol.n === null
      ? 'Дожим бросивших:    колонка ещё не на проде (нужен деплой 0164)'
      : `Дожим бросивших:    ${incompleteCol.n} писем`,
    '',
    'Скопируйте в SCOREBOARD: начатые / завершённые / оплаты / выручка.',
  ];
  return lines.join('\n');
}

module.exports = { run };

if (require.main === module) {
  const days = process.argv[2] || 7;
  run(days)
    .then((text) => {
      console.log(text);
      return pool.end();
    })
    .catch((err) => {
      console.error('weekFunnelStats упал:', err.message || err);
      pool.end().finally(() => process.exit(1));
    });
}
