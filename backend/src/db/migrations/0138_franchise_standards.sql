-- Стандарты сети и проверки (17.10.2026, docs/franchisor-compliance.md §2,
-- Ф15/Ф34). Франчайзер ведёт список своих требований к точкам (не закон —
-- форма, вывеска, договор версии сети, скорость ответа…). Один и тот же
-- список заполняют два раза: точка сама (kind = 'self') и проверяющий от
-- сети при визите, в том числе «тайный покупатель» (kind = 'audit').
-- В индекс безопасности не идёт — закон и стандарты сети не смешиваем.
CREATE TABLE IF NOT EXISTS franchise_standards (
    id                  SERIAL PRIMARY KEY,
    franchise_group_id  INTEGER NOT NULL REFERENCES franchise_groups(id) ON DELETE CASCADE,
    title               VARCHAR(200) NOT NULL,
    hint                TEXT,
    position            INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_franchise_standards_group ON franchise_standards(franchise_group_id, position);

CREATE TABLE IF NOT EXISTS franchise_standard_checks (
    id                  SERIAL PRIMARY KEY,
    franchise_group_id  INTEGER NOT NULL REFERENCES franchise_groups(id) ON DELETE CASCADE,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    kind                VARCHAR(10) NOT NULL CHECK (kind IN ('self', 'audit')),
    -- Кто проверял — как подписал франчайзер («тайный покупатель», «супервайзер»).
    auditor_label       VARCHAR(120),
    visited_on          DATE,
    comment             TEXT,
    created_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_franchise_standard_checks_point ON franchise_standard_checks(company_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS franchise_standard_answers (
    check_id     INTEGER NOT NULL REFERENCES franchise_standard_checks(id) ON DELETE CASCADE,
    standard_id  INTEGER NOT NULL REFERENCES franchise_standards(id) ON DELETE CASCADE,
    result       VARCHAR(10) NOT NULL CHECK (result IN ('yes', 'partial', 'no', 'na')),
    note         VARCHAR(500),
    PRIMARY KEY (check_id, standard_id)
);
