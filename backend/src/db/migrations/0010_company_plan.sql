-- Каждая студия (companies) — отдельная платная подписка в будущем.
-- Биллинга пока нет: plan_key просто резервирует место под привязку
-- к тарифу, ничего не проверяет и ничего не блокирует.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan_key VARCHAR(50);
