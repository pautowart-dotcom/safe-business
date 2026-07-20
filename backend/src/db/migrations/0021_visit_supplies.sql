-- Пакет 2, Этап 8 (по решению автора задачи — вариант "ручной выбор
-- расходников в визите", без каталога услуг/рецептов): связь визита с
-- расходниками, которые мастер отметил как использованные, и их
-- количеством — по ней при сохранении визита списывается остаток
-- (backend/src/core/supplyMovements.js), а при удалении/переоформлении
-- визита остаток возвращается.
CREATE TABLE IF NOT EXISTS visit_supplies (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    visit_id    INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    supply_id   INTEGER NOT NULL REFERENCES supplies(id) ON DELETE RESTRICT,
    quantity    NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visit_supplies_visit ON visit_supplies(visit_id);
CREATE INDEX IF NOT EXISTS idx_visit_supplies_supply ON visit_supplies(supply_id);
