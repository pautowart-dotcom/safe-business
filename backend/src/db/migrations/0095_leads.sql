-- Модуль "Заявки" (20.08.2026) — лёгкая воронка входящих заявок для ниш,
-- где нет менеджера отдела продаж (первый повод — клининг: владелица сама
-- разбирает заявки, ничего не теряя, физ/юр в одном списке). Сознательно
-- ОТДЕЛЬНАЯ таблица от clients, а не поле-статус на клиенте — на момент
-- заявки часто ещё не известны все данные клиента (нет ни адреса, ни
-- реквизитов, если это юрлицо), а раздувать обязательные поля clients ради
-- этого не нужно. Конвертация заявки в клиента (если понадобится) — ручное
-- действие пользователя на странице "Клиенты", не автоматика здесь.
CREATE TABLE IF NOT EXISTS leads (
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

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_client_type_check;
ALTER TABLE leads ADD CONSTRAINT leads_client_type_check
  CHECK (client_type IN ('individual', 'legal_entity'));

-- new → contacted → ordered → paid — тот же смысл, что и в 8-пунктном
-- роадмапе ("Новый лид→Связались→Заказ→Оплачено"), закреплён в БД буквально.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('new', 'contacted', 'ordered', 'paid'));

CREATE INDEX IF NOT EXISTS idx_leads_company_status ON leads(company_id, status);
