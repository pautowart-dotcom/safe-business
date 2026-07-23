-- Баг №1 (белый экран): временная диагностика по просьбе владельца —
-- ErrorBoundary (frontend/src/components/ErrorBoundary.jsx) шлёт сюда, что
-- именно упало и на каком экране, пока владелец вручную обходит разделы
-- приложения в поисках краша. Таблицу и роут снести, когда причина найдена
-- и пофикшена (см. docs/задача-баги-и-автопроверка.txt, баг №1).
CREATE TABLE IF NOT EXISTS client_error_reports (
    id                SERIAL PRIMARY KEY,
    message           TEXT,
    stack             TEXT,
    component_stack   TEXT,
    route             VARCHAR(300),
    user_agent        TEXT,
    user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
    standalone        BOOLEAN,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_error_reports_created ON client_error_reports(created_at DESC);
