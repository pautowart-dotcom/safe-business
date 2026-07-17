-- Модуль "Безопасность" (аудит рисков). Каталог вопросов и матрица нарушений
-- живут в коде (backend/src/modules/security/content/) через repository.js —
-- см. docs/security-engine/. Здесь только данные конкретной компании:
-- профиль сегментации, сессии прохождения аудита, ответы, персистентный
-- список нарушений (не сбрасывается между аудитами — "Устранено" сохраняется).

-- Одна запись на компанию, перезаписывается при повторном прохождении сегментации.
CREATE TABLE IF NOT EXISTS security_profiles (
    company_id      INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    legal_form      VARCHAR(20) NOT NULL CHECK (legal_form IN ('self_employed', 'ip', 'ooo')),
    work_model      VARCHAR(20) NOT NULL CHECK (work_model IN ('alone', 'employees', 'sublet', 'mixed')),
    segment         VARCHAR(50) NOT NULL,
    niche           VARCHAR(50),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security_sessions (
    id               SERIAL PRIMARY KEY,
    company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    type             VARCHAR(10) NOT NULL CHECK (type IN ('free', 'paid')),
    niche            VARCHAR(50) NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                     CHECK (status IN ('in_progress', 'completed')),
    total_questions  INTEGER,
    score            NUMERIC(6,1),
    max_score        NUMERIC(6,1),
    index_percent    NUMERIC(5,2),
    zone             VARCHAR(10) CHECK (zone IN ('green', 'yellow', 'red')),
    started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_security_sessions_company ON security_sessions(company_id, started_at DESC);

CREATE TABLE IF NOT EXISTS security_answers (
    id             SERIAL PRIMARY KEY,
    session_id     INTEGER NOT NULL REFERENCES security_sessions(id) ON DELETE CASCADE,
    company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    question_code  VARCHAR(20) NOT NULL,
    answer_index   INTEGER NOT NULL,
    points         NUMERIC(3,1) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, question_code)
);
CREATE INDEX IF NOT EXISTS idx_security_answers_session ON security_answers(session_id);

-- Персистентно на company_id, а не на сессию: кнопка "Устранено" переживает
-- повторные аудиты. Повторный платный аудит только добавляет/подтверждает
-- open-нарушения, resolved не сбрасывает (согласовано с владельцем продукта).
CREATE TABLE IF NOT EXISTS security_violations (
    id                     SERIAL PRIMARY KEY,
    company_id             INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    violation_code         VARCHAR(20) NOT NULL,
    niche                  VARCHAR(50) NOT NULL,
    status                 VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    first_session_id       INTEGER REFERENCES security_sessions(id) ON DELETE SET NULL,
    last_confirmed_session_id INTEGER REFERENCES security_sessions(id) ON DELETE SET NULL,
    resolved_at            TIMESTAMPTZ,
    resolved_by_membership_id INTEGER REFERENCES memberships(id) ON DELETE SET NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, violation_code)
);
CREATE INDEX IF NOT EXISTS idx_security_violations_company ON security_violations(company_id, status);

CREATE TABLE IF NOT EXISTS security_reports (
    id            SERIAL PRIMARY KEY,
    company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    session_id    INTEGER NOT NULL REFERENCES security_sessions(id) ON DELETE CASCADE,
    report_number VARCHAR(50) NOT NULL UNIQUE,
    pdf_path      VARCHAR(300),
    generated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_reports_company ON security_reports(company_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS security_documents (
    id           SERIAL PRIMARY KEY,
    company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category     VARCHAR(50) NOT NULL,
    name         VARCHAR(200) NOT NULL,
    file_url     VARCHAR(500) NOT NULL,
    uploaded_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_documents_company ON security_documents(company_id, category);

CREATE TABLE IF NOT EXISTS security_waitlist (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    segment     VARCHAR(50),
    niche       VARCHAR(50),
    product_key VARCHAR(30) NOT NULL CHECK (product_key IN ('paid_audit', 'document_package', 'subscription_calm', 'segment_unsupported')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Обычный UNIQUE(company_id, product_key, niche) не сработал бы как задумано:
-- Postgres считает каждый NULL в niche отдельным значением, а niche = NULL
-- как раз для product_key='segment_unsupported' — без COALESCE повторная
-- отправка сегментации плодила бы дубли записей в листе ожидания.
CREATE UNIQUE INDEX IF NOT EXISTS idx_security_waitlist_unique
    ON security_waitlist (company_id, product_key, COALESCE(niche, ''));

CREATE TABLE IF NOT EXISTS security_feedback (
    id             SERIAL PRIMARY KEY,
    session_id     INTEGER NOT NULL REFERENCES security_sessions(id) ON DELETE CASCADE,
    company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    selected_option VARCHAR(50) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
