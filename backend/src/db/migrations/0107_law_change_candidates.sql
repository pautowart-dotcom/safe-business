-- Движок клиентского платного мониторинга закона (03б карты фронтов,
-- 31.08.2026) — внутренний первый шаг: очередь кандидатов на изменение,
-- без клиентского UI и без оплаты. Источник подтверждён вручную curl'ом
-- 31.08.2026 (WebFetch не достучался до *.gov.ru, прямое соединение — да):
-- http://publication.pravo.gov.ru/api/rss?block=president — подписанные
-- президентом федеральные законы, включая поправки в НК РФ (нашлось 6
-- реальных примеров в выборке из ~200 последних записей). Не автопубликация
-- (решение владельца 31.08.2026) — движок только предлагает, публикует
-- только человек через админку.
CREATE TABLE IF NOT EXISTS law_change_candidates (
    id                SERIAL PRIMARY KEY,
    source            VARCHAR(30) NOT NULL DEFAULT 'pravo_gov_ru',
    source_block      VARCHAR(30) NOT NULL,
    title             TEXT NOT NULL,
    doc_url           TEXT NOT NULL UNIQUE,
    published_at      DATE,
    matched_keywords  TEXT[] NOT NULL DEFAULT '{}',
    status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by       VARCHAR(200),
    reviewed_at       TIMESTAMPTZ,
    note              TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS law_change_candidates_status_idx ON law_change_candidates (status, published_at DESC);
