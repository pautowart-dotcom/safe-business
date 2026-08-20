-- Модуль "Заявки" (20.08.2026) — лёгкая воронка входящих заявок для ниш,
-- где нет менеджера отдела продаж (первый повод — клининг: владелица сама
-- разбирает заявки, ничего не теряя, физ/юр в одном списке). Сознательно
-- ОТДЕЛЬНАЯ таблица от clients, а не поле-статус на клиенте — на момент
-- заявки часто ещё не известны все данные клиента (нет ни адреса, ни
-- реквизитов, если это юрлицо), а раздувать обязательные поля clients ради
-- этого не нужно. Конвертация заявки в клиента (если понадобится) — ручное
-- действие пользователя на странице "Клиенты", не автоматика здесь.
--
-- Названа sales_leads, а НЕ leads — в БД уже была таблица "leads" от более
-- старого публичного продукта "Роадмап для новичков" (roadmap.routes.js,
-- поля niche/legal_form/intake_answers, совсем другая сущность). Обнаружено
-- на реальном деплое: CREATE TABLE IF NOT EXISTS тихо не создал свою версию
-- (чужая таблица с тем же именем уже была), а следующий ALTER TABLE упал на
-- отсутствующей колонке — вся миграция откатилась, чужие данные не задеты.
CREATE TABLE IF NOT EXISTS sales_leads (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name                VARCHAR(200) NOT NULL,
    phone               VARCHAR(30),
    client_type         VARCHAR(20) NOT NULL DEFAULT 'individual',
    comment             TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'new',
    created_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sales_leads DROP CONSTRAINT IF EXISTS sales_leads_client_type_check;
ALTER TABLE sales_leads ADD CONSTRAINT sales_leads_client_type_check
  CHECK (client_type IN ('individual', 'legal_entity'));

-- new → contacted → ordered → paid — тот же смысл, что и в 8-пунктном
-- роадмапе ("Новый лид→Связались→Заказ→Оплачено"), закреплён в БД буквально.
ALTER TABLE sales_leads DROP CONSTRAINT IF EXISTS sales_leads_status_check;
ALTER TABLE sales_leads ADD CONSTRAINT sales_leads_status_check
  CHECK (status IN ('new', 'contacted', 'ordered', 'paid'));

CREATE INDEX IF NOT EXISTS idx_sales_leads_company_status ON sales_leads(company_id, status);
