-- Домены app.business-safe.ru / admin.business-safe.ru переименованы в
-- lk.business-safe.ru / office.business-safe.ru (см.
-- docs/status-2026-07-25-handoff.md). Миграция 0042 успела зашить старый
-- домен в текст оферты — обновляем его здесь. WHERE ... LIKE защищает от
-- перезаписи, если владелец уже поправил текст вручную через админ-панель.
UPDATE legal_documents
SET content = REPLACE(content, 'app.business-safe.ru', 'lk.business-safe.ru'),
    updated_at = now()
WHERE key = 'oferta' AND content LIKE '%app.business-safe.ru%';