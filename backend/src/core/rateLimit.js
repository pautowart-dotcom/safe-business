// Ограничитель частоты запросов по IP (20.09.2026, шаг 1 защиты от массового
// копирования — см. разбор: у платформы не было ни одного общего лимита, а
// гостевой старт теста выдаёт рабочий токен без почты и капчи).
//
// Счётчики в памяти процесса, окно фиксированное — намеренно просто, без
// новых зависимостей. ВАЖНО: под PM2 в cluster-режиме (deploy/
// ecosystem.config.js, сейчас instances: 2) у каждого воркера свой счётчик,
// запросы балансируются между ними — фактический потолок до instances × max.
// Для общего "предохранителя" это приемлемо (max подобран с запасом); там,
// где нужна точность (старт гостя), используется счётчик в БД
// (core/loginRateLimit.js), общий для всех воркеров.
function createRateLimiter({ windowMs, max, message, skip }) {
  const buckets = new Map(); // ip -> { count, resetAt }

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
  }, Math.max(windowMs, 30000));
  if (timer.unref) timer.unref();

  return function rateLimit(req, res, next) {
    if (skip && skip(req)) return next();
    const now = Date.now();
    const key = req.ip || 'unknown';
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > max) {
      res.set('Retry-After', String(Math.ceil((b.resetAt - now) / 1000)));
      return res.status(429).json({ error: message || 'Слишком много запросов. Подождите минуту и попробуйте снова.' });
    }
    return next();
  };
}

module.exports = { createRateLimiter };
