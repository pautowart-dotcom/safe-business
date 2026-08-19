-- История чата ИИ-ассистента (19.08.2026) — раньше жила только в state
-- страницы (см. комментарий в AiAssistant.jsx, "первый узкий срез"),
-- пропадала при обновлении/перезаходе. Владелец явно попросил хоть
-- какую-то постоянную историю. Контент зашифрован (тот же принцип, что
-- security_answers/generated_documents) — переписка может содержать
-- финансовые детали компании (суммы, категории расходов).
CREATE TABLE IF NOT EXISTS ai_assistant_messages (
    id            SERIAL PRIMARY KEY,
    company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role          VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content_enc   BYTEA NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_assistant_messages_company ON ai_assistant_messages(company_id, created_at);
