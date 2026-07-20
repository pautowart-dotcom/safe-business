const { Pool } = require('pg');
require('dotenv').config();

// max — соединений НА ОДИН процесс. Под PM2 cluster mode (deploy/
// ecosystem.config.js, Этап 10) воркеров несколько, каждый со своим
// Pool — итоговая нагрузка на Postgres = instances × max. Держим явным
// числом, а не дефолтом "10 и забыли", чтобы при следующем повышении
// instances это умножение не стало сюрпризом.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

module.exports = pool;
