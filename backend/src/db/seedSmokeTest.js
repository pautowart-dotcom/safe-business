require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('./pool');
const { studioOsBundleKeys } = require('../core/modules-registry');
const SMOKE_DEVICE_TOKEN = require('../core/smokeDeviceToken');
require('../modules'); // регистрирует модули в REGISTRY (side effect require, как в app.js)

// Отдельная "служебная" компания только для автопроверки после деплоя
// (backend/src/scripts/smokeCheck.js, docs/задача-баги-и-автопроверка.txt,
// Задача 0). НЕ пересекается с реальными клиентами — помечена
// industry_segment = '__smoke_test__', по этому маркеру и проверяем
// идемпотентность (повторный запуск ничего не создаёт заново).
const MARKER = '__smoke_test__';

async function ensureUser(client, { name, email, password }) {
  const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) return existing.rows[0].id;
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await client.query(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [name, email, passwordHash]
  );
  return rows[0].id;
}

// Без этого первый же /auth/login смоук-аккаунта упёрся бы в код
// подтверждения устройства (auth.routes.js) — у скрипта нет способа
// прочитать письмо. deviceToken тут захардкожен и известен smokeCheck.js.
async function ensureTrustedDevice(client, userId) {
  const tokenHash = crypto.createHash('sha256').update(SMOKE_DEVICE_TOKEN).digest('hex');
  await client.query(
    `INSERT INTO trusted_devices (user_id, device_token_hash) VALUES ($1, $2)
     ON CONFLICT (user_id, device_token_hash) DO NOTHING`,
    [userId, tokenHash]
  );
}

async function seed() {
  const accounts = ['OWNER', 'ADMIN', 'MASTER'].map((role) => ({
    role: role.toLowerCase(),
    name: `Смоук ${role}`,
    email: process.env[`SMOKE_${role}_EMAIL`],
    password: process.env[`SMOKE_${role}_PASSWORD`],
  }));
  const missing = accounts.filter((a) => !a.email || !a.password);
  if (missing.length > 0) {
    throw new Error(
      `Не заданы переменные окружения для тестовых ролей: ${missing
        .map((a) => `SMOKE_${a.role.toUpperCase()}_EMAIL/PASSWORD`)
        .join(', ')}`
    );
  }

  const client = await pool.connect();
  try {
    const existingCompany = await client.query(
      'SELECT id FROM companies WHERE industry_segment = $1 LIMIT 1',
      [MARKER]
    );
    if (existingCompany.rows.length > 0) {
      // Компания уже была заведена раньше — но доверенное устройство для
      // смоук-аккаунтов могло появиться позже (login_device_verification),
      // поэтому досоздаём его отдельно, не пересоздавая всё остальное.
      for (const account of accounts) {
        const userRes = await client.query('SELECT id FROM users WHERE email = $1', [account.email]);
        if (userRes.rows.length > 0) {
          await ensureTrustedDevice(client, userRes.rows[0].id);
        }
      }
      console.log('Смоук-компания уже существует, доверенные устройства проверены.');
      return;
    }

    await client.query('BEGIN');

    const companyResult = await client.query(
      `INSERT INTO companies (name, industry_segment, subscription_status)
       VALUES ('Смоук-тест (служебная)', $1, 'active') RETURNING id`,
      [MARKER]
    );
    const companyId = companyResult.rows[0].id;

    for (const account of accounts) {
      const userId = await ensureUser(client, account);
      await client.query(
        `INSERT INTO memberships (user_id, company_id, role, invite_status) VALUES ($1, $2, $3, 'active')`,
        [userId, companyId, account.role]
      );
      await ensureTrustedDevice(client, userId);
    }

    for (const moduleKey of studioOsBundleKeys()) {
      await client.query(
        `INSERT INTO company_modules (company_id, module_key, enabled) VALUES ($1, $2, true)
         ON CONFLICT (company_id, module_key) DO NOTHING`,
        [companyId, moduleKey]
      );
    }

    await client.query('COMMIT');
    console.log(`Смоук-компания создана (id=${companyId}), роли: ${accounts.map((a) => a.role).join(', ')}.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Ошибка заполнения смоук-компании:', err.message);
  process.exitCode = 1;
});
