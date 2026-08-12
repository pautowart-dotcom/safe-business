-- Разовые платные надстройки поверх базовой подписки (12.08.2026), первая —
-- "Шаблоны документов". В отличие от subscription_payments (рекуррентная
-- подписка на платформу целиком, ежемесячные автосписания), это разовая
-- покупка: одна успешная оплата = бессрочный доступ к конкретному addon_key
-- для этой компании, повторных списаний нет. Владелец решил (12.08.2026):
-- документы — не то, за что стоит брать деньги каждый месяц, если контент
-- сам по себе не обновляется настолько часто.
--
-- addon_key — свободный ключ (не FK на другую таблицу, как company_modules.
-- module_key на modules) — это не модуль платформы, а просто оплаченная
-- возможность внутри уже включённого модуля.
CREATE TABLE IF NOT EXISTS addon_purchases (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    addon_key           VARCHAR(50) NOT NULL,
    yookassa_payment_id VARCHAR(64) NOT NULL UNIQUE,
    amount_rub          INTEGER NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'canceled')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_addon_purchases_company ON addon_purchases(company_id, addon_key);
