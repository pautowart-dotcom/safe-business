-- Оформление сотрудника (17.10.2026, docs/franchise-funkcional.md Ф17).
-- Как оформлен сотрудник и когда принят — от этого зависит список шагов
-- (modules/staff/onboarding.js): договор, сведения в СФР, ознакомление с
-- локальными актами, инструктажи, уведомление МВД для иностранца.
-- Медкнижку здесь не отмечаем — сведения о здоровье (миграция 0125).
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS hired_on DATE;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS employment_type VARCHAR(20);
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS is_foreign BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_employment_type_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_employment_type_check
    CHECK (employment_type IS NULL OR employment_type IN ('labor', 'gph', 'npd', 'none'));

-- Отметки «сделано» по шагам. Сами шаги не храним — их список считается из
-- employment_type/is_foreign/ниши, поэтому смена типа договора не оставляет
-- мусорных строк в выдаче (лишние отметки просто не показываются).
CREATE TABLE IF NOT EXISTS staff_onboarding_steps (
    membership_id    INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    step_key         VARCHAR(40) NOT NULL,
    done_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    done_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (membership_id, step_key)
);
CREATE INDEX IF NOT EXISTS idx_staff_onboarding_steps_company ON staff_onboarding_steps(company_id);
