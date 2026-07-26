-- Онлайн-оплата подписки через ЮKassa (рекуррентные автосписания раз в
-- месяц). yookassa_payment_method_id — сохранённый способ оплаты, полученный
-- после первого успешного платежа с save_payment_method=true; используется
-- для последующих списаний без участия клиента (см. core/yookassa.js).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS yookassa_payment_method_id VARCHAR(64);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_price_rub INTEGER NOT NULL DEFAULT 1490;

-- Журнал всех попыток оплаты (первый платёж + все последующие автосписания)
-- — по нему сверяем вебхуки и решаем, продлевать ли подписку. Один платёж
-- ЮKassa (yookassa_payment_id) не должен встретиться дважды.
CREATE TABLE IF NOT EXISTS subscription_payments (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    yookassa_payment_id VARCHAR(64) NOT NULL UNIQUE,
    amount_rub          INTEGER NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'canceled')),
    is_recurring_charge BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_company ON subscription_payments(company_id);
