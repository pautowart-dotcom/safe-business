-- Модуль "База знаний". Разделы и статьи создаёт/редактирует только владелец,
-- мастер только читает (docs/task.md).
CREATE TABLE IF NOT EXISTS knowledge_sections (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(150) NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_sections_company ON knowledge_sections(company_id, sort_order);

CREATE TABLE IF NOT EXISTS knowledge_articles (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    section_id          INTEGER NOT NULL REFERENCES knowledge_sections(id) ON DELETE CASCADE,
    title               VARCHAR(250) NOT NULL,
    content             TEXT NOT NULL DEFAULT '',
    sort_order          INTEGER NOT NULL DEFAULT 0,
    created_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_section ON knowledge_articles(section_id, sort_order);
