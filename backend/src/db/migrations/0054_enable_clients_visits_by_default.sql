-- Владелец решил (31.07.2026): включить "Клиенты"/"Визиты" (а вместе с
-- "Клиенты" — и лист ожидания, он часть того же модуля) всем компаниям
-- сразу, не только вручную по запросу. Модули остаются переключаемыми —
-- это обратимо через UPDATE ниже (или через сам интерфейс,
-- POST /modules/:key/disable), если решение поменяется.
INSERT INTO company_modules (company_id, module_key, enabled, enabled_at)
SELECT c.id, m.key, true, now()
FROM companies c
CROSS JOIN (VALUES ('clients'), ('visits')) AS m(key)
ON CONFLICT (company_id, module_key) DO UPDATE SET enabled = true, enabled_at = now();
