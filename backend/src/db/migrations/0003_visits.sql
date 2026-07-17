-- Модуль "Визиты". Заработок мастера снимается со значения payout_percent
-- в момент визита (master_payout_percent) — так изменение % мастера владельцем
-- задним числом не меняет уже посчитанные визиты.
CREATE TABLE IF NOT EXISTS visits (
    id                      SERIAL PRIMARY KEY,
    company_id              INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id               INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    client_id               INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    master_membership_id    INTEGER NOT NULL REFERENCES memberships(id) ON DELETE RESTRICT,
    service                 VARCHAR(200) NOT NULL,
    materials               TEXT,
    amount                  NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    discount_percent        NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
    master_payout_percent   NUMERIC(5,2) NOT NULL,
    photo_before_url        TEXT,
    photo_after_url         TEXT,
    visit_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visits_company_visit_at ON visits(company_id, visit_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_master ON visits(master_membership_id, visit_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_client ON visits(client_id);
