-- Пакет 3, Этап 10 п.2: категории склада расходников — настраиваемые
-- (владелец сам заводит/переименовывает/удаляет), а не жёстко зашитые под
-- одну нишу (было раньше два фиксированных раздела "работа"/"бар" в
-- прототипе, потом убраны совсем). category_id nullable + ON DELETE
-- SET NULL — удаление категории не теряет сами расходники, они просто
-- становятся "без категории" (тот же принцип, что отключение модуля не
-- удаляет данные, Этап 1.1).
CREATE TABLE IF NOT EXISTS supply_categories (
    id         SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name       VARCHAR(100) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supply_categories_company ON supply_categories(company_id);

ALTER TABLE supplies ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES supply_categories(id) ON DELETE SET NULL;

-- Бэкафилл: у каждой существующей компании — два стартовых раздела
-- ("Работа"/"Бар", как было в исходном прототипе) владелец может
-- переименовать/удалить/добавить свои через обычный UI.
INSERT INTO supply_categories (company_id, name, sort_order)
SELECT c.id, 'Работа', 0 FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM supply_categories sc WHERE sc.company_id = c.id);

INSERT INTO supply_categories (company_id, name, sort_order)
SELECT c.id, 'Бар', 1 FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM supply_categories sc WHERE sc.company_id = c.id AND sc.name = 'Бар');
