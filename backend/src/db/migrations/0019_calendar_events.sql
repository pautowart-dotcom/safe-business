-- Пакет 2, Этап 7: календарь. membership_id — кому принадлежит событие
-- (например, чья смена); NULL = общее событие компании, видно
-- владельцу/админу, но не привязано к конкретному мастеру. created_by_
-- membership_id — кто создал (нужно, чтобы мастер мог редактировать только
-- свои личные напоминания, а не то, что назначил владелец).
CREATE TABLE IF NOT EXISTS calendar_events (
    id                      SERIAL PRIMARY KEY,
    company_id              INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    membership_id           INTEGER REFERENCES memberships(id) ON DELETE CASCADE,
    created_by_membership_id INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    title                   VARCHAR(200) NOT NULL,
    note                    TEXT,
    event_date              DATE NOT NULL,
    event_time              TIME,
    remind                  BOOLEAN NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_company_date ON calendar_events(company_id, event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_membership ON calendar_events(membership_id);
