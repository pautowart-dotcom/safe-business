-- Пакет 2, Этап 11: вступительная инструкция при первом входе в аккаунт.
-- NULL = ещё не видел, показываем модалку; не-NULL = когда закрыл/прошёл.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_seen_at TIMESTAMPTZ;
