-- Напоминание тем, кто начал тест и не закончил (есть реальный email + согласие на рассылку).
-- Один раз на пользователя, чтобы не спамить.
ALTER TABLE users ADD COLUMN IF NOT EXISTS incomplete_audit_followup_sent_at TIMESTAMPTZ;
