-- "Паспорт бизнеса" — 10.08.2026, тихая обкатка за is_test (см. хендофф).
-- Явное действие владельца ("поделиться") расширяет политику конфиденциальности
-- §8.4 ("данные аудита видит только владелец") — по умолчанию токена нет,
-- наружу ничего не отдаётся, пока владелец сам не сгенерирует ссылку
-- (POST /modules/security/share). Публичная сторона (GET /api/platform/
-- business-passport/:token) отдаёт только агрегаты (индекс/зона/счётчики),
-- НЕ конкретные нарушения — см. businessPassport.routes.js.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS security_share_token VARCHAR(64) UNIQUE;
