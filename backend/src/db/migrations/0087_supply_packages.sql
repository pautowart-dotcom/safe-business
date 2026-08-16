-- Наборы расходников (15.08.2026 обсуждение, 16.08.2026 реализация) —
-- именованный шаблон "расходник + количество", чтобы не вводить одно и то
-- же вручную на каждый визит (например, стандартный набор для маникюра).
-- Применяется в форме визита одним кликом, дальше список остаётся обычным
-- редактируемым списком расходников визита (можно дозаполнить/убрать/
-- поправить количество) — набор только ПРЕДЗАПОЛНЯЕТ, не ограничивает.
CREATE TABLE IF NOT EXISTS supply_packages (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(150) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supply_packages_company ON supply_packages(company_id);

-- ON DELETE CASCADE от supply_packages — удалили набор, ушли и его строки.
-- ON DELETE CASCADE от supplies — расходник удалили из каталога, запись в
-- наборе, где он упоминался, теряет смысл сама по себе (в отличие от
-- visit_supplies, где RESTRICT — там нельзя терять финансовую историю уже
-- состоявшегося визита; шаблон набора — не история, можно).
CREATE TABLE IF NOT EXISTS supply_package_items (
    id          SERIAL PRIMARY KEY,
    package_id  INTEGER NOT NULL REFERENCES supply_packages(id) ON DELETE CASCADE,
    supply_id   INTEGER NOT NULL REFERENCES supplies(id) ON DELETE CASCADE,
    quantity    NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    UNIQUE (package_id, supply_id)
);
CREATE INDEX IF NOT EXISTS idx_supply_package_items_package ON supply_package_items(package_id);
