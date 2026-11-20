-- Партнёрская программа (20.11.2026). Код задаёт сам человек, клиент продукта
-- или нет. Доля считается с первой оплаты заключения, документов или набора,
-- не с подписки. Выплата вручную, кабинет только показывает цифры.
-- Числа 30% и 14 дней повторены в core/partnerProgram.js и на
-- landing/partner/index.html — менять вместе.

CREATE TABLE IF NOT EXISTS partner_profiles (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL UNIQUE REFERENCES users(id),
    code        VARCHAR(32) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_visits (
    id           SERIAL PRIMARY KEY,
    partner_id   INTEGER NOT NULL REFERENCES partner_profiles(id),
    visitor_key  VARCHAR(64) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (partner_id, visitor_key)
);

CREATE TABLE IF NOT EXISTS partner_accruals (
    id           SERIAL PRIMARY KEY,
    partner_id   INTEGER NOT NULL REFERENCES partner_profiles(id),
    company_id   INTEGER NOT NULL REFERENCES companies(id),
    source       VARCHAR(20) NOT NULL CHECK (source IN ('report', 'templates', 'bundle')),
    source_id    INTEGER NOT NULL,
    amount_rub   INTEGER NOT NULL CHECK (amount_rub > 0),
    share_rub    INTEGER NOT NULL CHECK (share_rub > 0),
    status       VARCHAR(20) NOT NULL DEFAULT 'hold' CHECK (status IN ('hold', 'paid', 'void')),
    hold_until   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source, source_id)
);

ALTER TABLE subscription_payments
  ADD COLUMN IF NOT EXISTS partner_profile_id INTEGER REFERENCES partner_profiles(id);
ALTER TABLE addon_purchases
  ADD COLUMN IF NOT EXISTS partner_profile_id INTEGER REFERENCES partner_profiles(id);
