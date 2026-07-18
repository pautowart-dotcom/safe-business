-- Модуль "Обратная связь": одностороннее сообщение мастер -> владелец
-- (docs/task-frontend-v2.md, из прототипа studio_os_mvp.tsx).
CREATE TABLE IF NOT EXISTS feedback_messages (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    from_membership_id  INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    message             TEXT NOT NULL,
    read                BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_messages_company ON feedback_messages(company_id, created_at DESC);
