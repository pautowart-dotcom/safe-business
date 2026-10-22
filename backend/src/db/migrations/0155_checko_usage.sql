-- Счётчик запросов к Checko за сутки (22.10.2026): бесплатно 100 в сутки,
-- платный баланс без решения владельца не тратим. Общий для подсказки по
-- ИНН в тесте (1 запрос), снимка и наблюдения (5 запросов) — см.
-- modules/outside-watch/service.js reserveRequests.
CREATE TABLE IF NOT EXISTS checko_usage (
  day DATE PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0
);
