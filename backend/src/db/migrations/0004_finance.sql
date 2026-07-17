-- Модуль "Финансы". Зарплаты мастеров считаются напрямую из visits (не хранятся
-- отдельно). recurring_expenses — постоянные (fixed, ₽/мес) и процентные
-- (percent, % от выручки) расходы. expense_entries — переменные расходы,
-- фиксируется каждый факт (расходники, кухня и т.п.) отдельной записью.
CREATE TABLE IF NOT EXISTS recurring_expenses (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(150) NOT NULL,
    kind        VARCHAR(10) NOT NULL CHECK (kind IN ('fixed', 'percent')),
    amount      NUMERIC(10,2) NOT NULL CHECK (amount >= 0), -- ₽/мес для fixed, % для percent
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_company ON recurring_expenses(company_id);

CREATE TABLE IF NOT EXISTS expense_entries (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name                VARCHAR(150) NOT NULL,
    amount              NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    occurred_at         DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expense_entries_company_date ON expense_entries(company_id, occurred_at);
