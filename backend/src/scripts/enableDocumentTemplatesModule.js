require('dotenv').config();
const pool = require('../db/pool');

// Разовый скрипт (12.08.2026) — модуль document-templates зарегистрирован
// как studio-os/не-toggleable (auto-bundle), но это включает его только для
// НОВЫХ компаний при регистрации (см. studioOsBundleKeys() в
// core/modules-registry.js). Компаниям, созданным раньше, нужен один
// backfill — сделать это миграцией нельзя: company_modules.module_key
// ссылается на modules(key), а строка в modules появляется только через
// syncModulesTable() при старте сервера (после миграций), не в самой
// миграции. Идемпотентно (ON CONFLICT DO NOTHING) — безопасно запускать
// повторно.
async function run() {
  const { rowCount } = await pool.query(
    `INSERT INTO company_modules (company_id, module_key, enabled, enabled_at)
     SELECT id, 'document-templates', true, now() FROM companies
     ON CONFLICT (company_id, module_key) DO NOTHING`
  );
  console.log(`document-templates включён для ${rowCount} компаний (уже включённые пропущены)`);
  await pool.end();
}

run().catch((err) => {
  console.error('Не удалось включить модуль:', err);
  process.exit(1);
});
