-- Вход через Telegram Mini App (18.10.2026). Человек один раз входит
-- обычным способом (почта + пароль + код) внутри Telegram — после этого его
-- Telegram-аккаунт привязан, и кабинет в Telegram открывается сразу.
-- Храним только числовой id Telegram и ник (для подписи «привязан @ник»),
-- без телефона и имени из Telegram. Один Telegram — один пользователь.
CREATE TABLE IF NOT EXISTS telegram_links (
    telegram_user_id    BIGINT PRIMARY KEY,
    user_id             INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    tg_username         VARCHAR(64),
    linked_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at       TIMESTAMPTZ
);
