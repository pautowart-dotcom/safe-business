-- Новая категория 'operations' (смена не открыта, заканчиваются расходники)
-- для движка core/deadlines.js registerAction/registerAction — тот же приём,
-- что и в 0036 (там же список категорий уже расширялся один раз). Отдельно
-- от 'financial' (выручка не внесена — уже существующая категория, ей
-- просто не пользовался ни один вызывающий код до сих пор).
ALTER TABLE deadlines DROP CONSTRAINT IF EXISTS deadlines_category_check;
ALTER TABLE deadlines ADD CONSTRAINT deadlines_category_check
    CHECK (category IN ('staff', 'premises', 'documents', 'tax', 'journals', 'financial', 'operations'));

ALTER TABLE notification_settings DROP CONSTRAINT IF EXISTS notification_settings_category_check;
ALTER TABLE notification_settings ADD CONSTRAINT notification_settings_category_check
    CHECK (category IN ('staff', 'premises', 'documents', 'tax', 'journals', 'financial', 'operations'));
