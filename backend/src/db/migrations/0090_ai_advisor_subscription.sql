-- Настоящая ежемесячная подписка на ИИ-управляющего (советники по марже,
-- скидкам, уходу мастеров + дайджест) — 19.08.2026, пункт 2 из зафиксированного
-- владельцем плана (docs/status-2026-08-19-handoff.md). До этой миграции
-- доступ давал requirePaidPlanOrFreeAddons — просто проверка, что компания
-- вообще не в бесплатном пробном периоде базовой подписки; отдельного
-- платежа за ИИ не было. Владелец решил (19.08.2026): цену определить
-- самостоятельно (см. commit message/PR), подписка оформляется независимо
-- от статуса базовой (даже в её пробном периоде).
--
-- Отдельные company-колонки и отдельная таблица платежей — по образцу
-- базовой подписки (миграция 0044), а не переиспользование
-- subscription_status/subscription_payments, потому что это независимый
-- продукт с собственным жизненным циклом оплаты и собственной сохранённой
-- картой (компания может оплатить ИИ, не оплачивая базовую, и наоборот).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS ai_advisor_subscription_status VARCHAR(20) NOT NULL DEFAULT 'inactive'
    CHECK (ai_advisor_subscription_status IN ('inactive', 'active', 'past_due', 'cancelled'));
ALTER TABLE companies ADD COLUMN IF NOT EXISTS ai_advisor_subscription_current_period_end TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS ai_advisor_subscription_price_rub INTEGER NOT NULL DEFAULT 990;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS ai_advisor_yookassa_payment_method_id VARCHAR(64);

CREATE TABLE IF NOT EXISTS ai_advisor_subscription_payments (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    yookassa_payment_id VARCHAR(64) NOT NULL UNIQUE,
    amount_rub          INTEGER NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'canceled')),
    is_recurring_charge BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ai_advisor_subscription_payments_company ON ai_advisor_subscription_payments(company_id);
