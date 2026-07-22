-- Пакет 4, Этап 1: расширение движка дедлайнов — фундамент для всего пакета.
--
-- 1) Переименование категории 'legal' → 'documents' (юр.документы). Ни один
--    модуль ещё не создавал дедлайны с category='legal' (проверено по коду
--    на момент миграции), поэтому это чистое переименование, а не перенос
--    данных из активно используемой категории — UPDATE ниже на всякий
--    случай, если что-то всё же успело туда записаться руками через API.
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
UPDATE deadlines SET category = 'documents' WHERE category = 'legal';
UPDATE notification_settings SET category = 'documents' WHERE category = 'legal';

ALTER TABLE deadlines DROP CONSTRAINT IF EXISTS deadlines_category_check;
ALTER TABLE deadlines ADD CONSTRAINT deadlines_category_check
    CHECK (category IN ('staff', 'premises', 'documents', 'tax', 'journals', 'financial'));

ALTER TABLE notification_settings DROP CONSTRAINT IF EXISTS notification_settings_category_check;
ALTER TABLE notification_settings ADD CONSTRAINT notification_settings_category_check
    CHECK (category IN ('staff', 'premises', 'documents', 'tax', 'journals', 'financial'));

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
