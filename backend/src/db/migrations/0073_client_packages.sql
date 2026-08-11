-- Абонементы клиентов (11.08.2026) — предоплата за N визитов со скидкой за
-- пакет. Цена за визит (total_amount / total_sessions) не хранится отдельно,
-- считается на лету — так изменение задним числом невозможно, а формула
-- всегда одна. Выручка признаётся по визитам, не в момент продажи пакета
-- (finance_entries не трогаем — уже потраченный визит просто получает
-- корректный amount, см. visits.routes.js).
CREATE TABLE IF NOT EXISTS client_packages (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    client_id           INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    title               VARCHAR(200) NOT NULL,
    total_sessions      INTEGER NOT NULL CHECK (total_sessions > 0),
    sessions_used       INTEGER NOT NULL DEFAULT 0 CHECK (sessions_used >= 0 AND sessions_used <= total_sessions),
    total_amount        NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
    purchased_at        DATE NOT NULL DEFAULT CURRENT_DATE,
    cancelled_at        TIMESTAMPTZ,
    created_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_packages_client ON client_packages(client_id);

ALTER TABLE visits ADD COLUMN IF NOT EXISTS client_package_id
    INTEGER REFERENCES client_packages(id) ON DELETE SET NULL;

-- Отдельный способ оплаты "списано с абонемента" — чтобы owner-only
-- разбивка по способам оплаты (finance/summary.routes.js) не смешивала
-- абонементные визиты с наличкой/картой/переводом.
ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_payment_method_check;
ALTER TABLE visits ADD CONSTRAINT visits_payment_method_check
    CHECK (payment_method IN ('cash', 'card', 'transfer', 'package', 'other'));
