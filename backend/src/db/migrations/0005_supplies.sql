-- Модуль "Расходники". Остаток хранится прямо в supplies.quantity и меняется
-- только через приход/списание (supply_movements) — единая история движений.
CREATE TABLE IF NOT EXISTS supplies (
    id                    SERIAL PRIMARY KEY,
    company_id            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name                  VARCHAR(200) NOT NULL,
    unit                  VARCHAR(30),
    product_url           TEXT,
    quantity              NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    low_stock_threshold   NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supplies_company ON supplies(company_id);

CREATE TABLE IF NOT EXISTS supply_movements (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    supply_id           INTEGER NOT NULL REFERENCES supplies(id) ON DELETE CASCADE,
    type                VARCHAR(3) NOT NULL CHECK (type IN ('in', 'out')),
    quantity            NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    created_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supply_movements_supply ON supply_movements(supply_id, created_at DESC);
