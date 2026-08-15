-- Категории расходов (Этап 0 плана docs/plan-2026-08-15-analytics-ai-monthly-summary.md)
-- — разбивка расходов по смыслу (реклама/расходники/аренда/...), тем же
-- паттерном, что уже есть у выручки (byNiche/byMaster в summary.routes.js).
-- Nullable: у старых записей категории нет и мы не гадаем её задним числом —
-- фронт показывает такие записи как "без категории", требование категории
-- для новых записей — на уровне формы, не БД-констрейнта.
--
-- channel — второе измерение только для category='advertising' (решено
-- 15.08.2026: одной суммы "потрачено на рекламу" мало для анализа, нужно
-- знать, какой канал). Свободный текст, не enum — подсказки живут во
-- фронтенде (Instagram/Директ/ВК/листовки/блогер/агрегатор/другое), поле не
-- ограничивает ввод специально, чтобы не блокировать нестандартные случаи.
-- Не проверяется constraint'ом, что channel заполнен только при
-- category='advertising' — упростили: в остальных категориях канал просто
-- не показывается в форме, но технически поле не запрещает там значение.
ALTER TABLE expense_entries ADD COLUMN IF NOT EXISTS category VARCHAR(30)
    CHECK (category IN ('advertising', 'supplies', 'rent', 'utilities', 'accounting_legal', 'equipment_repair', 'other'));
ALTER TABLE expense_entries ADD COLUMN IF NOT EXISTS channel VARCHAR(100);

ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS category VARCHAR(30)
    CHECK (category IN ('advertising', 'supplies', 'rent', 'utilities', 'accounting_legal', 'equipment_repair', 'other'));
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS channel VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_expense_entries_company_category ON expense_entries(company_id, category);
