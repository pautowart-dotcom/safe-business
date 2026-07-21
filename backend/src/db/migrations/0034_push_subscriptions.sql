-- Пакет 3, Этап 9: push-уведомления (Web Push API). endpoint уникален
-- глобально (один и тот же браузер/устройство может быть подписан только
-- один раз) — повторная подписка (например, после переустановки PWA)
-- обновляет keys той же строки, а не плодит дубликаты.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id            SERIAL PRIMARY KEY,
    company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    membership_id INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    endpoint      TEXT NOT NULL UNIQUE,
    p256dh        TEXT NOT NULL,
    auth          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_company ON push_subscriptions(company_id);
