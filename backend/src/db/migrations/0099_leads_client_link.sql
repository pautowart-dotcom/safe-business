-- Связь заявок с клиентами и друг с другом по телефону (21.08.2026,
-- владелец: "если клиент уже третий раз закажет уборку, определится ли
-- он?" — раньше нет, sales_leads была полностью отдельной таблицей).
-- client_id — необязательная связь: заявка может ссылаться на уже
-- существующего клиента, если телефон совпал на момент создания заявки
-- (см. leads.routes.js/leads-public.routes.js). НЕ автоматическая
-- конвертация заявки в клиента — просто пометка "это тот же человек",
-- решение создавать ли клиента остаётся ручным (как и раньше).
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_leads_phone ON sales_leads(company_id, phone);
