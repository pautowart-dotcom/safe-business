const pool = require('../db/pool');

// Пакет 2, Этап 9: ограничение попыток входа — по IP (ловит перебор по
// многим аккаунтам с одного адреса) и отдельно по email (ловит перебор
// одного аккаунта с разных адресов/ботнета), окно — 15 минут.
const WINDOW_SQL = "created_at > now() - interval '15 minutes'";
const MAX_ATTEMPTS_PER_IP = 20;
const MAX_ATTEMPTS_PER_EMAIL = 5;

function ipKey(ip) {
  return `ip:${ip}`;
}
function emailKey(email) {
  return `email:${String(email).toLowerCase()}`;
}

async function countAttempts(identifier) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS n FROM login_attempts WHERE identifier = $1 AND ${WINDOW_SQL}`,
    [identifier]
  );
  return Number(rows[0].n);
}

// true — можно пробовать войти; false — превышен лимит.
async function checkLoginAllowed(ip, email) {
  // Опportunistic-очистка: без отдельного cron-джоба таблица не растёт
  // бесконечно — старые попытки удаляются на каждый вызов, дешёвая
  // индексная операция при небольшом объёме строк за сутки.
  await pool.query(`DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'`);

  const [ipCount, emailCount] = await Promise.all([
    countAttempts(ipKey(ip)),
    countAttempts(emailKey(email)),
  ]);
  return ipCount < MAX_ATTEMPTS_PER_IP && emailCount < MAX_ATTEMPTS_PER_EMAIL;
}

async function recordFailedLogin(ip, email) {
  await pool.query('INSERT INTO login_attempts (identifier) VALUES ($1), ($2)', [ipKey(ip), emailKey(email)]);
}

module.exports = { checkLoginAllowed, recordFailedLogin };
