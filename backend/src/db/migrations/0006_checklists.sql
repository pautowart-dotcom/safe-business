-- Модуль "Чек-листы". Шаблоны и пункты редактирует только владелец;
-- checklist_marks — отметки выполнения, которые ставит мастер (по дню смены).
CREATE TABLE IF NOT EXISTS checklist_templates (
    id           SERIAL PRIMARY KEY,
    company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name         VARCHAR(150) NOT NULL,
    description  TEXT,
    active       BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_company ON checklist_templates(company_id);

CREATE TABLE IF NOT EXISTS checklist_items (
    id           SERIAL PRIMARY KEY,
    template_id  INTEGER NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
    company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    label        VARCHAR(300) NOT NULL,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_checklist_items_template ON checklist_items(template_id, sort_order);

CREATE TABLE IF NOT EXISTS checklist_marks (
    id             SERIAL PRIMARY KEY,
    company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    item_id        INTEGER NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
    membership_id  INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    mark_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    checked        BOOLEAN NOT NULL DEFAULT true,
    checked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (item_id, membership_id, mark_date)
);
CREATE INDEX IF NOT EXISTS idx_checklist_marks_company_date ON checklist_marks(company_id, mark_date);
