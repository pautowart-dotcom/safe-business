-- Лента бумаг в боте (22.11.2026).
-- Сферу человек называет сам. Бумаги бот присылает по одной.
-- «есть» закрывает пункт, молчание оставляет его открытым, «хватит» останавливает ленту.
ALTER TABLE telegram_dialogs ADD COLUMN IF NOT EXISTS feed_sphere TEXT;
ALTER TABLE telegram_dialogs ADD COLUMN IF NOT EXISTS feed_stopped_at TIMESTAMPTZ;
ALTER TABLE telegram_dialogs ADD COLUMN IF NOT EXISTS feed_digest_at TIMESTAMPTZ;
ALTER TABLE telegram_dialogs ADD COLUMN IF NOT EXISTS feed_price_mentioned_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS telegram_feed_items (
    id                  BIGSERIAL PRIMARY KEY,
    telegram_user_id    BIGINT NOT NULL REFERENCES telegram_dialogs(telegram_user_id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    sort                SMALLINT NOT NULL,
    sent_at             TIMESTAMPTZ,
    closed_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (telegram_user_id, sort)
);

CREATE INDEX IF NOT EXISTS telegram_feed_items_user
    ON telegram_feed_items (telegram_user_id, sort);
