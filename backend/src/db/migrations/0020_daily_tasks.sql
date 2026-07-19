-- Пакет 2, Этап 7: "Задачи на сегодня" на главной странице владельца/
-- админа — личный редактируемый список каждого (не общий на компанию),
-- без строгой привязки к дате (владелец сам решает, когда отметить/
-- удалить пункт).
CREATE TABLE IF NOT EXISTS daily_tasks (
    id             SERIAL PRIMARY KEY,
    company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    membership_id  INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    text           VARCHAR(300) NOT NULL,
    done           BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_membership ON daily_tasks(membership_id, created_at);
