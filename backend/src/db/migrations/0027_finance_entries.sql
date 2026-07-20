-- Пакет 3, Этап 1.2: переработка Финансов — "двойной источник" выручки.
-- До этой миграции выручка нигде не хранилась отдельной записью — она
-- считалась налету суммой по visits (см. старую версию
-- modules/finance/summary.routes.js). Теперь у каждой записи о выручке есть
-- явный source: 'auto_from_visit' (создаётся автоматически при внесении
-- визита, см. modules/visits/visits.routes.js) или 'manual' (владелец
-- вносит сам, независимо от того, включён ли модуль visits_clients).
-- membership_id — НЕ NOT NULL: ручная запись может быть без привязки к
-- конкретному сотруднику (общая выручка без разбивки).
CREATE TABLE IF NOT EXISTS finance_entries (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    source              VARCHAR(20) NOT NULL CHECK (source IN ('auto_from_visit', 'manual')),
    visit_id            INTEGER REFERENCES visits(id) ON DELETE CASCADE,
    membership_id       INTEGER REFERENCES memberships(id) ON DELETE SET NULL,
    amount              NUMERIC(10,2) NOT NULL,
    comment             TEXT,
    occurred_at         DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (source != 'auto_from_visit' OR visit_id IS NOT NULL)
);
-- Один визит — не больше одной auto-записи (используется при PATCH визита,
-- чтобы держать сумму/сотрудника finance_entries синхронными с визитом).
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_entries_visit ON finance_entries(visit_id) WHERE visit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_finance_entries_company_date ON finance_entries(company_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_finance_entries_membership ON finance_entries(membership_id);

-- Бэкофилл: визиты, созданные до этой миграции, не имеют finance-записи —
-- создаём её задним числом, иначе отчёты за прошлые периоды обнулятся.
INSERT INTO finance_entries (company_id, source, visit_id, membership_id, amount, occurred_at, created_by_user_id, created_at)
SELECT company_id, 'auto_from_visit', id, master_membership_id,
       ROUND(amount - (amount * discount_percent / 100), 2), visit_at::date, created_by_user_id, created_at
FROM visits;
