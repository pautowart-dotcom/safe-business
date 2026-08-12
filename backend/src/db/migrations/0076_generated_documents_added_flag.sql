-- "Добавить в Мои документы" — после генерации предлагаем добавить документ
-- в security_documents (там же, где ручные загрузки), но не делаем это
-- автоматически: владелец мог сгенерировать документ на пробу и не
-- собираться его использовать. security_document_id — какая именно запись
-- security_documents появилась в результате подтверждения (NULL — ещё не
-- добавлен), чтобы кнопка "Добавить" не показывалась повторно и не плодила
-- дубликаты при повторном заходе на страницу.
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS security_document_id
    INTEGER REFERENCES security_documents(id) ON DELETE SET NULL;
