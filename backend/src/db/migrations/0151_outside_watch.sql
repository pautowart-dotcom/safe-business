-- «Ваш бизнес снаружи» (22.10.2026, решение владельца): снимок открытых
-- реестров по ИНН СВОЕГО бизнеса (бесплатно) + фоновое наблюдение у
-- подписчиков. Других людей не проверяем (проверка самозанятых мастеров
-- убрана по решению владельца до нормальной юридической схемы).
-- Источник — Checko API, см. modules/outside-watch/.
--
-- ИНН — зашифрован (core/crypto.js). Сырые ответы реестров НЕ храним: в них
-- ФИО директора/учредителей — для работы хватает summary (счётчики, статус,
-- ОКВЭД) и findings (готовые тексты без ФИО).

ALTER TABLE companies ADD COLUMN IF NOT EXISTS outside_inn_enc BYTEA;
-- Когда владелец подтвердил «это мой бизнес» — и не чаще раза в 30 дней
-- можно сменить ИНН (чтобы не следить по очереди за чужими).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS outside_inn_confirmed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS outside_watch_snapshots (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- 'free' — разовый снимок по кнопке; 'watch' — фоновое наблюдение.
  source VARCHAR(10) NOT NULL,
  summary JSONB NOT NULL,
  findings JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outside_watch_snapshots_company_idx
  ON outside_watch_snapshots (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS outside_watch_snapshots_created_idx
  ON outside_watch_snapshots (created_at);
