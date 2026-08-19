-- Клиент: физлицо/юрлицо + разовый/на обслуживании (19.08.2026, ниша
-- "Клининг" cleaning_basic). Клининговые компании работают и с физлицами,
-- и с юрлицами (разовый заказ или контракт на регулярные визиты) — но поля
-- универсальные, не привязаны к нише, полезны везде, где среди клиентов
-- бывают организации.
--
-- DEFAULT 'individual'/'one_time' — все существующие клиенты (маникюр и
-- т.д.) остаются физлицами на разовой основе, ничего не переинтерпретируем
-- задним числом. Поля необязательные — форма клиента их не требует ни в
-- одной нише.
--
-- Это только атрибуты клиента. Никакой логики вокруг "на обслуживании"
-- (расписание повторяющихся визитов, адреса объектов) здесь нет — сознательно
-- отдельная задача на будущее.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_type VARCHAR(20) NOT NULL DEFAULT 'individual';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS engagement_type VARCHAR(20) DEFAULT 'one_time';

-- Реквизиты для договора — нужны только когда client_type = 'legal_entity',
-- поэтому nullable и без constraint'а на непустоту у физлиц.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS organization_name VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS inn VARCHAR(20);

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_client_type_check;
ALTER TABLE clients ADD CONSTRAINT clients_client_type_check
  CHECK (client_type IN ('individual', 'legal_entity'));
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_engagement_type_check;
ALTER TABLE clients ADD CONSTRAINT clients_engagement_type_check
  CHECK (engagement_type IS NULL OR engagement_type IN ('one_time', 'contract'));
