-- Документы обновляются сами (22.10.2026, решение владельца «давай 2»):
-- когда шаблон выходит новой версией (меняется закон), документ клиента
-- пересобирается из уже сохранённых данных. По подписке — фоновым скриптом
-- scripts/documentUpdates.js, без подписки — кнопкой «Обновить».
-- regenerated_from_id — какую версию документ заменил: у заменённого
-- появляется «наследник», и он больше не считается устаревшим.
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS regenerated_from_id
    INTEGER REFERENCES generated_documents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_generated_documents_regenerated_from
    ON generated_documents(regenerated_from_id) WHERE regenerated_from_id IS NOT NULL;
