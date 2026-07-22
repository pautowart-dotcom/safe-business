-- Пакет 4, Этап 1: расширение движка дедлайнов — фундамент для всего пакета.
--
-- 1) Переименование категории 'legal' → 'documents' (юр.документы). В
--    deadlines её никто не создавал, но notification_settings — таблица
--    тумблеров уведомлений (deadlines.routes.js `/settings`) — вполне
--    могла получить строку category='legal' от реального пользователя,
--    переключившего уведомления по юр.категории ещё в Пакете 3 (и
--    push.routes.js даже подставлял 'legal' по умолчанию, если категория
--    не указана явно) — так и оказалось на проде, см. фикс ниже.
-- 2) Новые категории: premises (помещение/оборудование), journals (журналы).
--    'documents' уже добавлена переименованием выше. 'tax' и 'staff' уже
--    существовали (Пакет 3). 'financial' сознательно оставлена как есть,
--    про запас под будущие сроки от модуля "Финансы" — сейчас её никто не
--    создаёт.
-- 3) Два типа сущностей в одной таблице (Дедлайны/Действия) — вместо
--    отдельной таблицы под "Действия" используем ту же deadlines с полем
--    kind: 'deadline' (обязательно с due_date) или 'action' (обязательно
--    без due_date — условие есть, точной даты нет: "тест не пройден",
--    "кончаются расходники", "не заполнен журнал за сегодня"). Хранение в
--    одной таблице — то, что просит задача ("выводящихся вместе"): один
--    запрос, единая сортировка/статусы/уведомления для обоих типов.
-- Фикс 2026-07-22 (docs/bug-login-401.txt): порядок ниже был неверным —
-- UPDATE на category='documents' стоял ДО ALTER, который расширяет CHECK
-- до включения 'documents'. Пока действует СТАРЫЙ constraint (только
-- 'staff','legal','tax','financial'), любая существующая строка с
-- category='legal' (например, тумблер notification_settings по юр.
-- категории, включённый ещё в Пакете 3) ловит нарушение constraint прямо
-- на этом UPDATE — миграция падает и откатывается целиком, деплой
-- останавливается на этом шаге (deploy.sh с set -e), PM2 продолжает
-- работать на СТАРОМ коде — что и проявилось как "не пройти логин после
-- деплоя Пакета 4" (на самом деле деплой Пакета 4 не завершился вовсе).
-- Сначала расширяем constraint (старые значения остаются валидны, просто
-- добавляются новые допустимые), потом переносим данные.
ALTER TABLE deadlines DROP CONSTRAINT IF EXISTS deadlines_category_check;
ALTER TABLE deadlines ADD CONSTRAINT deadlines_category_check
    CHECK (category IN ('staff', 'premises', 'documents', 'tax', 'journals', 'financial'));

ALTER TABLE notification_settings DROP CONSTRAINT IF EXISTS notification_settings_category_check;
ALTER TABLE notification_settings ADD CONSTRAINT notification_settings_category_check
    CHECK (category IN ('staff', 'premises', 'documents', 'tax', 'journals', 'financial'));

UPDATE deadlines SET category = 'documents' WHERE category = 'legal';
UPDATE notification_settings SET category = 'documents' WHERE category = 'legal';

ALTER TABLE deadlines ALTER COLUMN due_date DROP NOT NULL;
ALTER TABLE deadlines ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'deadline'
    CHECK (kind IN ('deadline', 'action'));

-- Целостность: у дедлайна дата обязана быть, у действия — обязана
-- отсутствовать. Не полагаемся на дисциплину вызывающего кода (registerDeadline/
-- registerAction в core/deadlines.js и так это соблюдают, constraint — просто
-- страховка на случай будущих прямых INSERT).
ALTER TABLE deadlines DROP CONSTRAINT IF EXISTS deadlines_kind_due_date_check;
ALTER TABLE deadlines ADD CONSTRAINT deadlines_kind_due_date_check
    CHECK ((kind = 'deadline' AND due_date IS NOT NULL) OR (kind = 'action' AND due_date IS NULL));

CREATE INDEX IF NOT EXISTS idx_deadlines_company_kind ON deadlines(company_id, kind);
