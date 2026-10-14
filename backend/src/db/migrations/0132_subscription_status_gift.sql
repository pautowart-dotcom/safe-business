-- Подарочный месяц к заключению (14.10.2026, решение владельца): кто купил
-- заключение по гостевому тесту, получает месяц полного доступа в кабинете,
-- чтобы вести по нему план устранения. Без карты и без автосписания —
-- отдельный статус, а не 'active' (active без карты не истекает,
-- см. isSubscriptionActive) и не 'cancelled' (/reactivate превратил бы его
-- в вечный active, а в админке он выглядел бы как отток).
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_subscription_status_check;
ALTER TABLE companies ADD CONSTRAINT companies_subscription_status_check
    CHECK (subscription_status IN ('trial', 'active', 'past_due', 'cancelled', 'gift'));
