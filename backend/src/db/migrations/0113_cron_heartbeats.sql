-- Метка "последний успешный запуск" для фоновых кронов (03.09.2026,
-- лента наблюдения) — понадобилась, когда выяснилось, что
-- law_change_candidates (ON CONFLICT DO NOTHING) не годится как источник
-- "когда в последний раз проверяли закон": в тихий день без новых
-- совпадений в таблице не появляется ни одной строки, значит MAX(created_at)
-- не продвигается, хотя крон реально отработал. Универсальная таблица, не
-- только под lawChangeMonitor.js — на будущее так же можно отмечать другие
-- кроны (например dailyOperationsNudges.js), не заводя миграцию под каждый.
CREATE TABLE IF NOT EXISTS cron_heartbeats (
    job_key      VARCHAR(50) PRIMARY KEY,
    last_run_at  TIMESTAMPTZ NOT NULL,
    note         TEXT
);
