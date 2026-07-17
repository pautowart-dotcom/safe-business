const bcrypt = require('bcryptjs');
const pool = require('./db');
require('dotenv').config();

async function seed() {
  const name = process.env.SEED_OWNER_NAME || 'Владелец';
  const email = process.env.SEED_OWNER_EMAIL;
  const password = process.env.SEED_OWNER_PASSWORD;

  if (!email || !password) {
    throw new Error('Укажите SEED_OWNER_EMAIL и SEED_OWNER_PASSWORD в .env');
  }

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    console.log('Владелец с таким email уже существует, пропускаем.');
    await pool.end();
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'owner')`,
    [name, email, hash]
  );
  console.log(`Владелец создан: ${email}`);
  await pool.end();
}

seed().catch((err) => {
  console.error('Ошибка заполнения данных:', err);
  process.exit(1);
});
