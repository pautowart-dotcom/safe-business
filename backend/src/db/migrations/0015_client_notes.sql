-- Пакет 2, Этап 4: необязательные поля клиента "Пожелания", "Замечания",
-- "Аллергии" — свободный текст, отдельные столбцы (не общий JSON/текст),
-- т.к. каждое поле показывается отдельно в карточке клиента.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferences TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS allergies TEXT;
