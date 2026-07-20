-- Пакет 3, Этап 1.1: "Визиты"/"Клиенты" перестают быть модулями, включёнными
-- всем компаниям по умолчанию (backend/src/core/modules-registry.js —
-- studioOsBundleKeys() теперь исключает toggleable-модули). Существующие
-- компании уже вовсю используют эти разделы, поэтому фиксируем им явное
-- enabled=true, чтобы для них ничего не изменилось. Новые компании
-- регистрируются без этих двух строк в company_modules — COALESCE(enabled,
-- false) в GET /platform/modules и hasModuleAccess() в core/sdk.js
-- трактуют отсутствие строки как выключенный модуль.
INSERT INTO company_modules (company_id, module_key, enabled)
SELECT id, 'visits', true FROM companies
ON CONFLICT (company_id, module_key) DO UPDATE SET enabled = true;

INSERT INTO company_modules (company_id, module_key, enabled)
SELECT id, 'clients', true FROM companies
ON CONFLICT (company_id, module_key) DO UPDATE SET enabled = true;
