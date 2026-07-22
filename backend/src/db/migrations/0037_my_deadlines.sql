-- Пакет 4, Этап 2: вкладка "Мои сроки" в разделе "Безопасность".
--
-- note/recurrence — общие необязательные поля прямо в deadlines (не
-- отдельная таблица): note — контакт подрядчика/комментарий, recurrence —
-- периодичность для повторяющихся сроков (ТО сигнализации, замер
-- изоляции и т.п.). Когда такой срок отмечают "Готово" (PATCH /:id в
-- deadlines.routes.js), due_date автоматически сдвигается на следующий
-- период вместо того, чтобы запись просто исчезала из списка — иначе
-- периодичность была бы декоративным полем, которое ничего не делает.
ALTER TABLE deadlines ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE deadlines ADD COLUMN IF NOT EXISTS recurrence VARCHAR(20)
    CHECK (recurrence IN ('monthly', 'quarterly', 'half_year', 'yearly'));

-- Сырые исходные данные для двух вычисляемых сроков "Моих сроков":
-- sout_last_at — дата последней СОУТ, следующая считается +5 лет (фиксировано
-- законом, см. §"Не пытаться вычислить..." в docs/task-batch-4.txt).
-- ip_registered_at/has_employees — исходные данные для налоговых слотов
-- (core/taxDeadlines.js): дата регистрации отсекает уже прошедшие на момент
-- регистрации кварталы (не создаём напоминания о периодах ДО открытия ИП),
-- has_employees включает отчётность за сотрудников (РСВ/6-НДФЛ).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS sout_last_at DATE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS ip_registered_at DATE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS has_employees BOOLEAN;

-- Договоры с сотрудниками, если срочные (дата окончания) — тот же
-- staff_documents, что и мед.книжки/сертификаты (Пакет 3, Этап 3), просто
-- новый doc_type, чтобы не заводить параллельную таблицу и переиспользовать
-- готовый UI в Users.jsx.
ALTER TABLE staff_documents DROP CONSTRAINT IF EXISTS staff_documents_doc_type_check;
ALTER TABLE staff_documents ADD CONSTRAINT staff_documents_doc_type_check
    CHECK (doc_type IN ('medical_book', 'certificate', 'employment_contract'));
