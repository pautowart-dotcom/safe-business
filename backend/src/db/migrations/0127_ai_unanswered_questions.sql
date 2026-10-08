-- Вопросы ИИ-ассистенту, на которые в базе сервиса не нашлось ответа
-- (08.10.2026) — раз в неделю владелец смотрит список и дополняет базу.
-- Сознательно без company_id/user_id: важен вопрос и ниша, а не кто спросил.
-- Текст зашифрован (core/crypto.js), хранится 90 дней — чистит сам роут
-- при каждой записи (ai-assistant.routes.js, logUnanswered).

CREATE TABLE IF NOT EXISTS ai_unanswered_questions (
    id            SERIAL PRIMARY KEY,
    question_enc  TEXT NOT NULL,
    niches        TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_unanswered_questions_created_at_idx ON ai_unanswered_questions (created_at);
