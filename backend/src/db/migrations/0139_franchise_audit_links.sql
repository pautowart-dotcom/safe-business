-- Ссылка для проверяющего без аккаунта (17.10.2026): франчайзер отправляет
-- тайному покупателю или супервайзеру ссылку на форму проверки одной точки.
-- Одноразовая (used_at), живёт 14 дней. Проверяющий видит только название
-- сети, название точки и список стандартов — ничего из кабинета точки.
CREATE TABLE IF NOT EXISTS franchise_audit_links (
    token               VARCHAR(64) PRIMARY KEY,
    franchise_group_id  INTEGER NOT NULL REFERENCES franchise_groups(id) ON DELETE CASCADE,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    auditor_label       VARCHAR(120),
    created_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL,
    used_at             TIMESTAMPTZ,
    check_id            INTEGER REFERENCES franchise_standard_checks(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_franchise_audit_links_group ON franchise_audit_links(franchise_group_id, created_at DESC);
