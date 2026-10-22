-- «Ваш бизнес снаружи» (22.10.2026, решение владельца «делаем всё сразу»):
-- снимок открытых реестров по ИНН (бесплатно) + ежедневное наблюдение и
-- проверка самозанятых мастеров (по подписке). Источник — Checko API и
-- API ФНС «Проверка статуса самозанятого», см. modules/outside-watch/.
--
-- ИНН и сырые ответы — зашифрованы (core/crypto.js): в ответах по ИП есть
-- ФИО, ИНН мастеров — их персональные данные. Для сравнения «было — стало»
-- хватает summary (счётчики, статус, ОКВЭД) — в нём ФИО нет.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS outside_inn_enc BYTEA;

CREATE TABLE IF NOT EXISTS outside_watch_snapshots (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- 'free' — разовый снимок по кнопке; 'watch' — ежедневный прогон наблюдения.
  source VARCHAR(10) NOT NULL,
  raw_enc BYTEA,
  summary JSONB NOT NULL,
  findings JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outside_watch_snapshots_company_idx
  ON outside_watch_snapshots (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS outside_watch_snapshots_created_idx
  ON outside_watch_snapshots (created_at);

CREATE TABLE IF NOT EXISTS outside_watch_masters (
  id BIGSERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  label VARCHAR(120) NOT NULL,
  inn_enc BYTEA NOT NULL,
  -- Последние 4 цифры — чтобы владелец отличал записи, не расшифровывая ИНН.
  inn_tail VARCHAR(4) NOT NULL,
  -- null — ещё не проверяли; true/false — ответ ФНС на дату last_checked_at.
  last_status BOOLEAN,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outside_watch_masters_company_idx ON outside_watch_masters (company_id);
