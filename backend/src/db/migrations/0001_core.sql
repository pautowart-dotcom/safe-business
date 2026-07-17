-- Платформенное ядро: users, companies, branches, memberships, modules, company_modules, event_log
-- Никаких упоминаний "studio" — только company/branch (нейтральный неймспейс ядра).

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    phone           VARCHAR(30),
    password_hash   VARCHAR(255) NOT NULL,
    is_super_admin  BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
    id                    SERIAL PRIMARY KEY,
    name                  VARCHAR(200) NOT NULL,
    industry_segment      VARCHAR(100),
    created_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    subscription_status   VARCHAR(20) NOT NULL DEFAULT 'trial'
                          CHECK (subscription_status IN ('trial', 'active', 'past_due', 'cancelled')),
    trial_ends_at         TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(200) NOT NULL,
    address     VARCHAR(300),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- user_id нулевой только пока приглашение не принято (invite_status = 'pending')
CREATE TABLE IF NOT EXISTS memberships (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'master')),
    branch_id       INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    payout_percent  NUMERIC(5,2),
    invited_email   VARCHAR(150),
    invite_token    VARCHAR(64) UNIQUE,
    invite_status   VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (invite_status IN ('pending', 'active')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (user_id IS NOT NULL OR invite_status = 'pending')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_user_company
    ON memberships(user_id, company_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memberships_company ON memberships(company_id);

CREATE TABLE IF NOT EXISTS modules (
    key                 VARCHAR(50) PRIMARY KEY,
    name                VARCHAR(150) NOT NULL,
    description         TEXT,
    icon                VARCHAR(50),
    category            VARCHAR(50),
    backend_base_path   VARCHAR(100),
    frontend_entry      VARCHAR(150),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_modules (
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    module_key  VARCHAR(50) NOT NULL REFERENCES modules(key) ON DELETE CASCADE,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    enabled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    settings    JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (company_id, module_key)
);

-- Единый событийный журнал для будущей ИИ-аналитики
CREATE TABLE IF NOT EXISTS event_log (
    id          BIGSERIAL PRIMARY KEY,
    company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    module_key  VARCHAR(50),
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id   INTEGER,
    action      VARCHAR(50) NOT NULL,
    payload     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_log_company ON event_log(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_branches_company ON branches(company_id);
