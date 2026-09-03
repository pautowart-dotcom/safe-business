-- Проверка сайта на риски 152-ФЗ (03.09.2026) — один движок на три точки
-- продажи: отдельный разовый продукт на лендинге, усиление бесплатного
-- теста безопасности, бесплатный бонус для подписчиков. Доступ решается
-- существующими механизмами (addon_purchases + isSubscriptionActive, см.
-- core/middleware), эта таблица хранит только результат самого скана.
--
-- status='awaiting_payment' — строка создана при чек-ауте разовой покупки
-- (addons.routes.js), ещё до подтверждения оплаты ЮKassa (id уходит в
-- metadata.websiteCheckId, по аналогии с subscription_payments.report_id,
-- миграция 0091). Вебхук переводит в 'pending' и запускает скан. Для
-- пути "бонус подписчику" (source='subscription') оплаты нет вообще —
-- строка сразу создаётся в статусе 'pending'.
CREATE TABLE IF NOT EXISTS website_checks (
    id             SERIAL PRIMARY KEY,
    company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    url            VARCHAR(500) NOT NULL,
    source         VARCHAR(20) NOT NULL CHECK (source IN ('standalone', 'test', 'subscription')),
    status         VARCHAR(20) NOT NULL DEFAULT 'awaiting_payment'
                   CHECK (status IN ('awaiting_payment', 'pending', 'completed', 'failed')),
    findings       JSONB,
    score          NUMERIC(5,2),
    zone           VARCHAR(10) CHECK (zone IN ('green', 'yellow', 'red')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_website_checks_company ON website_checks(company_id, created_at DESC);
