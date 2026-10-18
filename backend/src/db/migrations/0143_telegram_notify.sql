-- Уведомления сообщением в Telegram (18.10.2026).
-- notify — выбор человека в «Настройках» («присылать в Telegram»).
-- blocked_at — Telegram ответил 403: бот заблокирован или человек ещё не
-- нажимал «Старт». Снимается сам, когда человек пишет боту /start. Отдельно
-- от notify, чтобы не перетирать выбор человека.
ALTER TABLE telegram_links ADD COLUMN IF NOT EXISTS notify BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE telegram_links ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
