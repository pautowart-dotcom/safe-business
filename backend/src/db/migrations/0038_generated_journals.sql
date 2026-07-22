-- Пакет 4, Этап 3: генерация персональных печатных PDF-журналов с
-- уникальным номером и QR (assets/journal-templates/, см. readme.txt там).
-- PDF не хранится в БД — собирается заново на каждый /download из шаблона +
-- этих полей (детерминированно, дёшево пересобрать, дорого хранить бинарники
-- для каждого журнала каждой компании).
CREATE TABLE IF NOT EXISTS generated_journals (
    id                     SERIAL PRIMARY KEY,
    company_id             INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    journal_type           VARCHAR(30) NOT NULL
        CHECK (journal_type IN ('uf_lamp', 'sterilizers', 'pre_sterilization', 'instruktazh', 'disinfectants')),
    journal_number          VARCHAR(30) NOT NULL UNIQUE,
    qr_token                VARCHAR(64) NOT NULL UNIQUE,
    pages_count             INTEGER NOT NULL,
    -- Задел на будущее (см. docs/task-batch-4.txt, Этап 3): параллельное
    -- цифровое ведение журнала — отдельный пакет позже, здесь только поле.
    has_digital_duplicate  BOOLEAN NOT NULL DEFAULT false,
    created_by_user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_generated_journals_company ON generated_journals(company_id, journal_type);
