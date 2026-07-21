-- Пакет 3, Этап 4: налоговый режим компании — основа для автогенерации
-- налоговых напоминаний (core/taxDeadlines.js). Список специально короткий
-- и расширяемый (см. TAX_REGIMES в core/taxDeadlines.js) — добавление
-- нового режима это правка constraint здесь + новой ветки там, без смены
-- модели данных. NULL — режим не указан, напоминания не генерируются.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_regime VARCHAR(30)
    CHECK (tax_regime IN ('patent', 'usn_income', 'usn_income_expense', 'osn'));
