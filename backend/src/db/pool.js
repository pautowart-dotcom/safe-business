const { Pool } = require('pg');
require('dotenv').config();

// max — соединений НА ОДИН процесс. Под PM2 cluster mode (deploy/
// ecosystem.config.js, Этап 10) воркеров несколько, каждый со своим
// Pool — итоговая нагрузка на Postgres = instances × max. Держим явным
// числом, а не дефолтом "10 и забыли", чтобы при следующем повышении
// instances это умножение не стало сюрпризом.
// Сервер почти наверняка в UTC (нигде в проекте не выставлен TZ при
// провижининге), а все студии — в России. Без этого visit_at::date и
// подобные касты timestamptz→date (SUM выручки за день, отчёты, дашборд)
// считают календарный день по UTC — окно с полуночи до 3 утра по Москве
// (21:00–23:59 UTC предыдущих суток) попадало не в тот день. См. также
// utils/moscowDate.js — тот же класс бага на стороне Node, но там TZ
// процесса не помогает (toISOString всегда UTC), поэтому там отдельный фикс.
// Таймзона передаётся стартовым параметром соединения (options), а не
// отдельным SET TIME ZONE через pool.on('connect') — та версия слала запрос,
// не дожидаясь его завершения, и pg иногда ловил "query while client already
// executing a query" на следующий же запрос с того же соединения.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  options: '-c TimeZone=Europe/Moscow',
});

module.exports = pool;
