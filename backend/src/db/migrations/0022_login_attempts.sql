-- Пакет 2, Этап 9 п.1: rate limiting на логин. Отдельная таблица (не
-- in-memory счётчик в процессе) — Этап 10 переводит PM2 на cluster mode
-- (несколько Node-процессов на одном порту), а in-memory Map не делится
-- между воркерами и не защитил бы от подбора пароля через кластер.
CREATE TABLE IF NOT EXISTS login_attempts (
    id          SERIAL PRIMARY KEY,
    identifier  VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier_time ON login_attempts(identifier, created_at);
