-- Раздел "Поддержка" в "Ещё" (Пакет 2, Этап 4): простая форма связи с
-- разработчиком, без системы тикетов — только запись обращения в БД.
CREATE TABLE IF NOT EXISTS support_requests (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id  INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    email       TEXT NOT NULL,
    message     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_requests_created ON support_requests(created_at DESC);
