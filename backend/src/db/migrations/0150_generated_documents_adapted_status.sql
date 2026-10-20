-- Оферты юриста (20.10.2026, content/lawyerOferta.js): новый статус шаблона
-- 'adapted' — составлено сервисом на основе шаблона юриста под нишу, юрист
-- адаптацию не проверял. Снимок статуса при генерации должен его принимать.
ALTER TABLE generated_documents DROP CONSTRAINT IF EXISTS generated_documents_template_status_at_generation_check;
ALTER TABLE generated_documents ADD CONSTRAINT generated_documents_template_status_at_generation_check
  CHECK (template_status_at_generation IN ('draft', 'reviewed', 'adapted'));
