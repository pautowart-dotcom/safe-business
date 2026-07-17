-- Модуль "Клиенты": общая база клиентов компании (не привязана к филиалу —
-- владелец видит клиентов всех своих филиалов).
CREATE TABLE IF NOT EXISTS clients (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    phone               VARCHAR(30),
    created_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clients_company_last_name ON clients(company_id, last_name);
