require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

// Создаёт первого пользователя платформы с флагом is_super_admin — это Артём,
// видит все компании всех клиентов (см. docs/task.md, п.1 "Роль Super Admin").
// Компанию скрипт не создаёт: у Super Admin доступ к платформе не зависит от
// членства в компании (см. platform/admin.routes.js).
async function seed() {
  const name = process.env.SEED_OWNER_NAME || 'Владелец';
  const email = process.env.SEED_OWNER_EMAIL;
  const password = process.env.SEED_OWNER_PASSWORD;

  if (!email || !password) {
    throw new Error('Укажите SEED_OWNER_EMAIL и SEED_OWNER_PASSWORD в .env');
  }

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    console.log('Пользователь с таким email уже существует, пропускаем.');
    await pool.end();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, is_super_admin) VALUES ($1, $2, $3, true)`,
    [name, email, passwordHash]
  );
  console.log(`Super Admin создан: ${email}`);
  await pool.end();
}

seed().catch((err) => {
  console.error('Ошибка заполнения начальных данных:', err);
  pool.end().finally(() => process.exit(1));
});
