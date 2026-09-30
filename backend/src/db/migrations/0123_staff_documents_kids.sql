-- Документы сотрудников для детских ниш (30.09.2026, под знакомого владельца
-- из франшизы детских клубов). Проверено law-compliance-monitor 26.09.2026:
-- — справка об отсутствии судимости (ст. 351.1 ТК РФ) нужна ПРИ ПРИЁМЕ, в
--   сферах с несовершеннолетними; законного срока действия у неё нет —
--   поэтому хранится дата выдачи (issued_on), а не срок, и напоминания нет;
-- — периодический медосмотр для работы с детьми — раз в год (приказ 29н,
--   п. 25 раздела VI приложения) — обычный срок expires_at = дата
--   следующего осмотра, с напоминанием, как у медкнижки.
ALTER TABLE staff_documents ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE staff_documents ADD COLUMN IF NOT EXISTS issued_on DATE;

ALTER TABLE staff_documents DROP CONSTRAINT IF EXISTS staff_documents_doc_type_check;
ALTER TABLE staff_documents ADD CONSTRAINT staff_documents_doc_type_check
    CHECK (doc_type IN ('medical_book', 'certificate', 'employment_contract', 'criminal_record_certificate', 'periodic_medical_exam'));

-- Срок обязателен у всех, кроме справки о несудимости — у неё вместо срока
-- дата выдачи.
ALTER TABLE staff_documents DROP CONSTRAINT IF EXISTS staff_documents_date_check;
ALTER TABLE staff_documents ADD CONSTRAINT staff_documents_date_check
    CHECK (expires_at IS NOT NULL OR (doc_type = 'criminal_record_certificate' AND issued_on IS NOT NULL));
