-- Лёгкий "лист ожидания" клиентов (владелец, 29.07.2026) — без расписания/
-- слотов, которых в приложении нет: клиентка хочет записаться, но сейчас
-- всё занято — просто список, который вручную отмечают "связался/записали",
-- когда реально появится окно. Не связано с visits (те — уже прошедшие
-- визиты, не будущие).
CREATE TABLE IF NOT EXISTS client_waitlist (
    id                   SERIAL PRIMARY KEY,
    company_id           INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    client_id            INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    service              VARCHAR(200),
    comment              TEXT,
    status               VARCHAR(10) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'done')),
    created_by_membership_id INTEGER REFERENCES memberships(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_client_waitlist_company ON client_waitlist(company_id, status, created_at DESC);
