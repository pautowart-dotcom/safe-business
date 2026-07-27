-- Подтверждение входа с нового устройства кодом на почту. Не при каждом
-- входе (слишком много трения для нетехничной аудитории — см. историю с
-- обычным сбросом пароля в этой же сессии), только когда устройство ещё не
-- было подтверждено. Оба значения (код, токен устройства) хранятся хэшем,
-- как пароль — по той же логике, что password_reset_tokens.
CREATE TABLE IF NOT EXISTS login_verification_codes (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash   VARCHAR(64) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_verification_codes_user ON login_verification_codes(user_id);

-- Uniqueness — по паре (user_id, device_token_hash), не по одному хэшу:
-- реальным пользователям это не важно (токен — 32 случайных байта на
-- каждый раз, коллизия между разными людьми практически невозможна), а
-- смоук-тесту (seedSmokeTest.js) это нужно — там один и тот же
-- фиксированный токен намеренно выдаётся сразу трём служебным аккаунтам.
CREATE TABLE IF NOT EXISTS trusted_devices (
    id                SERIAL PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_token_hash VARCHAR(64) NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, device_token_hash)
);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices(user_id);
