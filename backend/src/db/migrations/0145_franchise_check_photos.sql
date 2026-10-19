-- Фото к проверке точки (19.10.2026, владелец: «в тайном покупателе должны
-- быть разделы для ввода фото»). Проверяющий по ссылке прикладывает фото к
-- пункту стандарта (standard_id) или к проверке целиком (standard_id NULL).
-- Пока проверка не отправлена, фото держится за ссылку (link_token); при
-- отправке получает check_id. Файл — в uploads (core/fileStorage.js), в БД
-- голый путь, подпись — только при отдаче клиенту.
CREATE TABLE IF NOT EXISTS franchise_check_photos (
    id           SERIAL PRIMARY KEY,
    link_token   VARCHAR(64) REFERENCES franchise_audit_links(token) ON DELETE CASCADE,
    check_id     INTEGER REFERENCES franchise_standard_checks(id) ON DELETE CASCADE,
    standard_id  INTEGER REFERENCES franchise_standards(id) ON DELETE SET NULL,
    file_url     VARCHAR(255) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_franchise_check_photos_check ON franchise_check_photos(check_id);
CREATE INDEX IF NOT EXISTS idx_franchise_check_photos_link ON franchise_check_photos(link_token);
