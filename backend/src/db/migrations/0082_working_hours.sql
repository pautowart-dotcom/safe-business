-- Рабочие часы для утилизации (Этап 3 плана docs/plan-2026-08-15-analytics-ai-monthly-summary.md)
-- — двухуровневая настройка, решение 15.08.2026: дефолт на компанию (все
-- мастера с похожим графиком — ничего не настраивают, работает "из коробки"
-- на дефолте 8) + необязательное переопределение на конкретного мастера
-- (неполная занятость/другой график).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_daily_hours NUMERIC(4,1) NOT NULL DEFAULT 8;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS daily_hours NUMERIC(4,1);
