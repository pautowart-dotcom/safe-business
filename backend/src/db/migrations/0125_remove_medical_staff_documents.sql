-- Медкнижки и медосмотры сотрудников больше не храним (01.10.2026, решение
-- владельца после разбора с юристом): даты и сканы — сведения о здоровье,
-- особая категория ПДн (ст. 10 152-ФЗ), а политика обработки ПДн говорит,
-- что особые категории не обрабатываются. Вместо хранения — напоминание раз
-- в квартал "проверьте медкнижки сотрудников" (scripts/dailyOperationsNudges.js).
--
-- Удаление необратимо: записи staff_documents этих типов, их напоминания в
-- deadlines и файлы-сканы. Файлы удаляет утренний скрипт по очереди
-- pending_file_deletions (SQL-миграция не может трогать диск).

CREATE TABLE IF NOT EXISTS pending_file_deletions (
    id          SERIAL PRIMARY KEY,
    file_url    TEXT NOT NULL,
    reason      VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO pending_file_deletions (file_url, reason)
SELECT file_url, 'medical_staff_documents_removed'
FROM staff_documents
WHERE doc_type IN ('medical_book', 'periodic_medical_exam') AND file_url IS NOT NULL;

DELETE FROM deadlines
WHERE related_entity_type = 'staff_document'
  AND related_entity_id IN (SELECT id FROM staff_documents WHERE doc_type IN ('medical_book', 'periodic_medical_exam'));

DELETE FROM staff_documents WHERE doc_type IN ('medical_book', 'periodic_medical_exam');

ALTER TABLE staff_documents DROP CONSTRAINT IF EXISTS staff_documents_doc_type_check;
ALTER TABLE staff_documents ADD CONSTRAINT staff_documents_doc_type_check
    CHECK (doc_type IN ('certificate', 'employment_contract', 'criminal_record_certificate'));
