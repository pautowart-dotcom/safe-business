-- Раздел «Уведомления» (Ж2 плана этапа 2, 14.10.2026; решения владельца —
-- docs/uvedomleniya-predlozhenie.md). Push исчезает после прочтения — здесь
-- копится всё, что сервис сообщил компании: сроки, изменения законов, новые
-- пункты теста. Push остаётся как сигнал, запись пишет core/notifications.js
-- перед отправкой push.
--
-- dedupe_key — чтобы повтор одного и того же (ежедневное действие,
-- переопубликованное изменение закона) обновлял запись, а не плодил копии.
-- read_at — на компанию, не на пользователя: в студии обычно один владелец.
CREATE TABLE IF NOT EXISTS company_notifications (
    id          BIGSERIAL PRIMARY KEY,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    kind        VARCHAR(20) NOT NULL CHECK (kind IN ('deadline', 'law', 'test', 'other')),
    category    VARCHAR(20),
    title       TEXT NOT NULL,
    body        TEXT,
    url         TEXT,
    dedupe_key  VARCHAR(120),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at     TIMESTAMPTZ,
    UNIQUE (company_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_company_notifications_feed ON company_notifications (company_id, created_at DESC);
