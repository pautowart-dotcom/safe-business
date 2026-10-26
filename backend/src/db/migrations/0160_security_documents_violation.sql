-- Путь до 100 % (26.10.2026, docs/plan-2026-10-26.md, шаг 2). Фото или файл,
-- приложенные к шагу «Сделано», ложатся в те же «Документы» раздела
-- «Безопасность» — с привязкой к нарушению, чтобы показать их у шага и позже
-- собрать «папку к проверке». Нарушение удалили — документ остаётся.
ALTER TABLE security_documents
    ADD COLUMN IF NOT EXISTS violation_id INTEGER REFERENCES security_violations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_security_documents_violation ON security_documents(violation_id) WHERE violation_id IS NOT NULL;
