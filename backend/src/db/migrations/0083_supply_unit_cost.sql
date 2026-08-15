-- Себестоимость по материалам (Этап 4 плана docs/plan-2026-08-15-analytics-ai-monthly-summary.md)
-- — закупочная цена на расходник. Nullable: до заполнения владельцем
-- себестоимость по конкретной позиции просто не считается (0, не ошибка) —
-- см. supplies.routes.js/summary.routes.js, там же owner/admin-only гейт
-- (цена закупки — то же по чувствительности, что чистая прибыль).
ALTER TABLE supplies ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10,2);
