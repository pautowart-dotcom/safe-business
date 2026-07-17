const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Миграция выполнена успешно.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Ошибка миграции:', err);
  process.exit(1);
});
