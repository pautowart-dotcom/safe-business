-- Промокоды (решено владельцем 08.10.2026): скидка только на ПЕРВЫЙ платёж
-- подписки, дальше обычная цена (companies.subscription_price_rub не
-- меняется — автопродления chargeRecurringSubscriptions.js списывают полную).
-- applies_to — "на что действует": 'subscription' (первый платёж подписки),
-- 'report' (разовая покупка отчёта в гостевом тесте с лендинга — основной
-- поток, решение владельца 09.10.2026), позже шаблоны ('templates'). Лимиты и срок владелец
-- задаёт сам в админке. Коды не удаляются (история оплат ссылается на них) —
-- только выключаются (active = false).
-- До ответа юриста по оферте коды работают только для тестовых компаний
-- (companies.is_test) — см. core/promoCodes.js, PROMO_CODES_ENABLED.

CREATE TABLE IF NOT EXISTS promo_codes (
    id               SERIAL PRIMARY KEY,
    code             VARCHAR(32) NOT NULL UNIQUE,
    discount_type    VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
    discount_value   INTEGER NOT NULL CHECK (discount_value > 0),
    applies_to       VARCHAR(20) NOT NULL DEFAULT 'subscription' CHECK (applies_to IN ('subscription', 'report', 'templates')),
    -- Тестовый код — работает и в режиме обкатки (без PROMO_CODES_ENABLED),
    -- чтобы владелец мог проверить гостевой тест с лендинга на себе: гость —
    -- новая компания без пометки is_test.
    test_only        BOOLEAN NOT NULL DEFAULT false,
    max_redemptions  INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
    valid_until      TIMESTAMPTZ,
    active           BOOLEAN NOT NULL DEFAULT true,
    note             TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS promo_code_id INTEGER REFERENCES promo_codes(id);
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS discount_rub INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_subscription_payments_promo ON subscription_payments(promo_code_id) WHERE promo_code_id IS NOT NULL;
