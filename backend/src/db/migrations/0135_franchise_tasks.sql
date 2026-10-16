-- Задачи от сети (16.10.2026, docs/franchise-funkcional.md §11, этап 3:
-- Ф30/Ф31). Франчайзер отправляет точкам распоряжение или «проверьте у себя
-- X» (например, после проверки в другой точке), точка отмечает «сделано»,
-- пульт показывает, сколько точек выполнили.
CREATE TABLE IF NOT EXISTS franchise_tasks (
    id                  SERIAL PRIMARY KEY,
    franchise_group_id  INTEGER NOT NULL REFERENCES franchise_groups(id) ON DELETE CASCADE,
    kind                VARCHAR(20) NOT NULL CHECK (kind IN ('order', 'check')),
    title               VARCHAR(200) NOT NULL,
    body                TEXT,
    due_date            DATE,
    created_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_franchise_tasks_group ON franchise_tasks(franchise_group_id, created_at DESC);

-- Строка на каждую точку, которой задача отправлена (точки, вступившие
-- позже, старых задач не получают). Точка вышла из сети — строка остаётся
-- в истории, но в пульте и у точки не показывается (фильтр по членству).
CREATE TABLE IF NOT EXISTS franchise_task_points (
    task_id          INTEGER NOT NULL REFERENCES franchise_tasks(id) ON DELETE CASCADE,
    company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    done_at          TIMESTAMPTZ,
    done_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    comment          VARCHAR(500),
    PRIMARY KEY (task_id, company_id)
);
CREATE INDEX IF NOT EXISTS idx_franchise_task_points_company ON franchise_task_points(company_id);

-- Уведомление точке о задаче — новый вид «От сети» в разделе «Уведомления».
ALTER TABLE company_notifications DROP CONSTRAINT IF EXISTS company_notifications_kind_check;
ALTER TABLE company_notifications ADD CONSTRAINT company_notifications_kind_check
    CHECK (kind IN ('deadline', 'law', 'test', 'network', 'other'));
