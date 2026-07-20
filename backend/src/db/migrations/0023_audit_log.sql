-- Пакет 2, Этап 9 п.2: аудит-лог чувствительных действий — отдельно от
-- event_log (тот собирает ВСЕ события платформы для будущей ИИ-аналитики,
-- этот — только удаления, изменения прав доступа, создание/удаление
-- компании, без "избыточной детализации на каждое мелкое действие").
CREATE TABLE IF NOT EXISTS audit_log (
    id           BIGSERIAL PRIMARY KEY,
    company_id   INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action       VARCHAR(50) NOT NULL,
    entity_type  VARCHAR(50) NOT NULL,
    entity_id    INTEGER,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_company ON audit_log(company_id, created_at DESC);
