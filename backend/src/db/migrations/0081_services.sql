-- Каталог услуг с длительностью (Этап 2 плана docs/plan-2026-08-15-analytics-ai-monthly-summary.md)
-- — единственный по-настоящему новый кусок данных на пути к утилизации
-- (Этап 3): без длительности услуги "% загрузки" посчитать нечем.
-- niche — nullable: у одно-нишевых студий не нужен, у мульти-нишевых
-- фильтрует список при выборе услуги на конкретную нишу визита.
CREATE TABLE IF NOT EXISTS services (
    id                SERIAL PRIMARY KEY,
    company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    niche             VARCHAR(50),
    name              VARCHAR(200) NOT NULL,
    duration_minutes  INTEGER NOT NULL CHECK (duration_minutes > 0),
    approx_price      NUMERIC(10,2),
    active            BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_services_company ON services(company_id);

-- visits.service остаётся текстом для истории (не ломаем прошлые записи и
-- ручной ввод "мимо каталога") — service_id опциональная связь: заполняется,
-- когда услуга выбрана из каталога, а не введена свободным текстом.
-- ON DELETE SET NULL, не RESTRICT: архивирование услуги (active=false,
-- через API, см. services.routes.js) — основной путь, но если когда-нибудь
-- появится настоящее удаление строки, старые визиты не должны из-за этого
-- отказываться сохраняться/читаться.
ALTER TABLE visits ADD COLUMN IF NOT EXISTS service_id INTEGER REFERENCES services(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_visits_service_id ON visits(service_id);
