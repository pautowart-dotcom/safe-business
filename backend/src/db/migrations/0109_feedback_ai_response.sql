-- Единый поток вопросов и решений (docs/vision.md.txt, "Единый поток
-- вопросов и решений — принцип", 02.09.2026): сотрудник пишет вопрос в
-- "Обратную связь" — ИИ пробует ответить сам сразу, если уверен; если нет —
-- явно эскалирует владельцу, а не молчит и не гадает. Раньше forma была
-- строго одностороняя (мастер -> владелец, читает только человек).
--
-- ai_response — NULL, пока ИИ не ответил или счёл нужным эскалировать.
-- escalated — true, если ИИ явно решил не отвечать (или не настроен) и
-- вопрос ждёт владельца, как и раньше.
ALTER TABLE feedback_messages ADD COLUMN IF NOT EXISTS ai_response TEXT;
ALTER TABLE feedback_messages ADD COLUMN IF NOT EXISTS escalated BOOLEAN NOT NULL DEFAULT false;
