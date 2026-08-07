-- Обсуждение 07.08.2026: (1) прикрепление файла-подтверждения к сроку
-- ("Мои сроки") и к документу сотрудника (мед.книжка/сертификат) — тот же
-- принцип, что и security_documents (фото/скан/PDF); (2) индекс безопасности
-- (status.js) начинает учитывать просроченные сроки категорий
-- staff/premises/documents и просроченные мед.книжки как "проваленные
-- вопросы" — без изменений схемы под это, только под (1).
ALTER TABLE deadlines ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE staff_documents ADD COLUMN IF NOT EXISTS file_url TEXT;
