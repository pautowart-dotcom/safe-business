-- Обсуждение 09.08.2026: вложения (фото/видео) к обращению в поддержку —
-- отдельная таблица, не колонки на support_requests, т.к. количество и
-- микс типов открытые (клиент может приложить и фото, и видео сразу).
CREATE TABLE IF NOT EXISTS support_request_attachments (
    id                  SERIAL PRIMARY KEY,
    support_request_id INTEGER NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
    file_url            TEXT NOT NULL,
    mime_type            VARCHAR(100),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_request_attachments_request ON support_request_attachments(support_request_id);
