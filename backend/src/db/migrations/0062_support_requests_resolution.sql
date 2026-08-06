-- Фаза 0 "журнала решений" (AI-второй-собственник, обсуждение 06.08.2026):
-- у обращений в поддержку раньше не было ни статуса, ни способа ответить
-- из кабинета (только mailto: — ответ уходил в личную почту и нигде не
-- сохранялся). resolution_note — причина решения, тот самый материал,
-- на котором позже учится ИИ-подсказчик (см. draft-reply в admin.routes.js).
ALTER TABLE support_requests
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS reply_text TEXT,
    ADD COLUMN IF NOT EXISTS resolution_note TEXT,
    ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_support_requests_status ON support_requests(status);
