-- Безопасный бизнес: схема базы данных PostgreSQL

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(150) NOT NULL,
    email         VARCHAR(150) NOT NULL UNIQUE,
    phone         VARCHAR(30),
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'master')),
    active        BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(150) NOT NULL,
    phone      VARCHAR(30),
    email      VARCHAR(150),
    birthday   DATE,
    notes      TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visits (
    id          SERIAL PRIMARY KEY,
    client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    master_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    service     VARCHAR(200) NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    price       NUMERIC(12,2) NOT NULL DEFAULT 0,
    status      VARCHAR(20) NOT NULL DEFAULT 'planned'
                CHECK (status IN ('planned', 'completed', 'cancelled', 'no_show')),
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_transactions (
    id          SERIAL PRIMARY KEY,
    type        VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
    amount      NUMERIC(12,2) NOT NULL,
    category    VARCHAR(100) NOT NULL,
    description TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    visit_id    INTEGER REFERENCES visits(id) ON DELETE SET NULL,
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplies (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(150) NOT NULL,
    category      VARCHAR(100),
    unit          VARCHAR(30) NOT NULL DEFAULT 'шт',
    quantity      NUMERIC(12,2) NOT NULL DEFAULT 0,
    min_threshold NUMERIC(12,2) NOT NULL DEFAULT 0,
    price_per_unit NUMERIC(12,2) NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supply_transactions (
    id         SERIAL PRIMARY KEY,
    supply_id  INTEGER NOT NULL REFERENCES supplies(id) ON DELETE CASCADE,
    type       VARCHAR(10) NOT NULL CHECK (type IN ('in', 'out')),
    quantity   NUMERIC(12,2) NOT NULL,
    note       TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checklists (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    role_target VARCHAR(20) NOT NULL DEFAULT 'master'
                CHECK (role_target IN ('owner', 'master', 'all')),
    items       JSONB NOT NULL DEFAULT '[]',
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checklist_completions (
    id             SERIAL PRIMARY KEY,
    checklist_id   INTEGER NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    completion_date DATE NOT NULL DEFAULT CURRENT_DATE,
    checked_items  JSONB NOT NULL DEFAULT '[]',
    completed      BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (checklist_id, user_id, completion_date)
);

CREATE TABLE IF NOT EXISTS knowledge_articles (
    id         SERIAL PRIMARY KEY,
    title      VARCHAR(200) NOT NULL,
    category   VARCHAR(100) NOT NULL DEFAULT 'Общее',
    content    TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security_incidents (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    category    VARCHAR(50) NOT NULL DEFAULT 'other'
                CHECK (category IN ('sanitary', 'fire', 'data', 'equipment', 'client_complaint', 'other')),
    severity    VARCHAR(20) NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high')),
    description TEXT,
    status      VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
    reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security_checklist_items (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    frequency   VARCHAR(20) NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'monthly')),
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visits_master ON visits(master_id);
CREATE INDEX IF NOT EXISTS idx_visits_client ON visits(client_id);
CREATE INDEX IF NOT EXISTS idx_visits_scheduled ON visits(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_finance_occurred ON finance_transactions(occurred_at);
CREATE INDEX IF NOT EXISTS idx_supply_tx_supply ON supply_transactions(supply_id);
CREATE INDEX IF NOT EXISTS idx_checklist_completions_date ON checklist_completions(completion_date);
CREATE INDEX IF NOT EXISTS idx_security_incidents_status ON security_incidents(status);
