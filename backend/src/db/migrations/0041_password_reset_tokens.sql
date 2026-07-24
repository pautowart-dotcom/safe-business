-- Восстановление пароля — раньше не было вовсе (пользователь, забывший
-- пароль, не мог попасть в аккаунт никак). Токен хранится хэшем (как
-- пароль), не в открытом виде — по аналогии с memberships.invite_token,
-- только тут ставка выше (даёт доступ к существующему аккаунту, не к
-- приглашению), поэтому именно хэш, а не значение как есть.
-- token_plain — ВРЕМЕННО, пока не подключена реальная отправка email
-- (нет ни одной email-библиотеки/SMTP в проекте). Позволяет Super Admin
-- вручную передать ссылку человеку, который потерял пароль, через панель
-- (см. admin.routes.js). Видно только Super Admin, не публично. Убрать
-- колонку и роут просмотра, когда подключится настоящая отправка почты.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    token_plain VARCHAR(64),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
