-- Публикация расшифровки изменения закона подписчикам ИИ-тарифа (05.09.2026)
-- — отдельная от law_change_candidates (миграция 0107) таблица: там очередь
-- сырых кандидатов на разбор владельцем, здесь — только то, что реально
-- решили показать подписчикам, с готовым текстом. Не смешиваем поля
-- публикации в таблицу мониторинга, чтобы её основной смысл (сырая очередь
-- для ручного review) не размывался.
CREATE TABLE IF NOT EXISTS law_change_notices (
    id            SERIAL PRIMARY KEY,
    candidate_id  INTEGER NOT NULL UNIQUE REFERENCES law_change_candidates(id),
    explanation   TEXT NOT NULL,
    published_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_law_change_notices_published ON law_change_notices(published_at DESC);
