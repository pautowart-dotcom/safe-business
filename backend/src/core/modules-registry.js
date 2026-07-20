// Единый реестр модулей маркетплейса. Каждый модуль добавляет сюда одну запись
// по мере реализации (см. modules/*) — это единственное место, где ядро "узнаёт"
// о существовании модуля. company_modules решает, включён ли он для конкретной компании.
const pool = require('../db/pool');

const REGISTRY = [];

function registerModule({ key, name, description, icon, category, backendBasePath, frontendEntry, router, toggleable }) {
  REGISTRY.push({ key, name, description, icon, category, backendBasePath, frontendEntry, router, toggleable: !!toggleable });
}

async function syncModulesTable() {
  for (const m of REGISTRY) {
    await pool.query(
      `INSERT INTO modules (key, name, description, icon, category, backend_base_path, frontend_entry)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (key) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         icon = EXCLUDED.icon,
         category = EXCLUDED.category,
         backend_base_path = EXCLUDED.backend_base_path,
         frontend_entry = EXCLUDED.frontend_entry`,
      [m.key, m.name, m.description, m.icon, m.category, m.backendBasePath, m.frontendEntry]
    );
  }
}

function mountModules(app) {
  for (const m of REGISTRY) {
    if (m.router) app.use(m.backendBasePath, m.router);
  }
}

// toggleable-модули (сейчас только visits/clients, Пакет 3 Этап 1) не входят
// в автовключение при регистрации компании — для новых компаний они
// выключены по умолчанию, владелец включает их сам через POST
// /platform/modules/:key/enable.
function studioOsBundleKeys() {
  return REGISTRY.filter((m) => m.category === 'studio-os' && !m.toggleable).map((m) => m.key);
}

module.exports = { REGISTRY, registerModule, syncModulesTable, mountModules, studioOsBundleKeys };
