-- Пакет 2, Этап 9 п.3 + политика конфиденциальности §8.2: "Данные аудита
-- безопасности... подлежат шифрованию при хранении". Шифруем на уровне
-- приложения (AES-256-GCM, core/crypto.js), не через pgcrypto — колонки
-- security_violations.violation_code/security_sessions.index_percent
-- участвуют в UNIQUE(company_id, violation_code) и ON CONFLICT-апсертах
-- (см. security.routes.js), а вероятностное шифрование ломает такие
-- constraint'ы (одинаковый plaintext даёт разный ciphertext при каждой
-- записи) — их шифрование сознательно отложено, требует отдельного
-- redesign уникальности (например, отдельная detministic-хеш-колонка для
-- ON CONFLICT). Здесь шифруется то, что безопасно шифровать прямо сейчас:
-- сырые ответы на вопросы теста (какой вариант выбран, сколько баллов) —
-- ни на что не завязаны через constraint, читаются/пишутся только по
-- session_id + question_code.
--
-- Старые колонки (answer_index, points) не удаляются и не мигрируются
-- миграцией — ключ шифрования не должен попадать в закоммиченный .sql-
-- файл. Код (security.routes.js, report.routes.js) пишет теперь только в
-- *_enc; при чтении старых (уже существующих на момент этого коммита)
-- строк, где *_enc ещё NULL, — fallback на исходные колонки.
ALTER TABLE security_answers ADD COLUMN IF NOT EXISTS answer_index_enc BYTEA;
ALTER TABLE security_answers ADD COLUMN IF NOT EXISTS points_enc BYTEA;

-- Новые записи больше не заполняют answer_index/points (только *_enc) —
-- снимаем NOT NULL, иначе INSERT без этих полей падал бы.
ALTER TABLE security_answers ALTER COLUMN answer_index DROP NOT NULL;
ALTER TABLE security_answers ALTER COLUMN points DROP NOT NULL;
