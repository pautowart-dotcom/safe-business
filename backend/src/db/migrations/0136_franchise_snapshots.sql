-- Ежемесячный отчёт франчайзеру (16.10.2026, docs/franchise-funkcional.md
-- §11, этап 4: Ф28). Индекс точек хранится только «на сейчас» — чтобы
-- показать «что стало лучше за месяц», 1-го числа сохраняем снимок сводки
-- сети (scripts/franchiseMonthlySnapshot.js). Отчёт за месяц сравнивает
-- снимок на его начало со снимком на конец (или с текущим состоянием).
CREATE TABLE IF NOT EXISTS franchise_network_snapshots (
    franchise_group_id  INTEGER NOT NULL REFERENCES franchise_groups(id) ON DELETE CASCADE,
    snapshot_date       DATE NOT NULL,
    data                JSONB NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (franchise_group_id, snapshot_date)
);
