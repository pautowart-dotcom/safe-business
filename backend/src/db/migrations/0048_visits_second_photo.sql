-- Владелец: одного фото "до" и одного "после" мало — нужно по два на визит.
-- Добавляем вторую пару колонок вместо перехода на массив/JSON — минимальное
-- изменение схемы, легко обратимо, не трогает существующие данные и запросы.
ALTER TABLE visits ADD COLUMN IF NOT EXISTS photo_before_url_2 TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS photo_after_url_2 TEXT;
