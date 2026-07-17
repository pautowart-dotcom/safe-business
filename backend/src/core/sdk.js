// Тонкий SDK, через который модули общаются с ядром платформы.
// Модуль никогда не импортирует код другого модуля напрямую — только это.
const pool = require('../db/pool');
const { logEvent } = require('./eventLog');

function getCurrentUser(req) {
  return req.user;
}

function getCurrentCompany(req) {
  return req.tenant;
}

async function hasModuleAccess(companyId, moduleKey) {
  const { rows } = await pool.query(
    'SELECT 1 FROM company_modules WHERE company_id = $1 AND module_key = $2 AND enabled = true',
    [companyId, moduleKey]
  );
  return rows.length > 0;
}

// Middleware-фабрика: подключается в роутере модуля после requireAuth + requireTenant,
// чтобы модуль был недоступен компании, у которой он не включён в company_modules.
function requireModule(moduleKey) {
  return async function (req, res, next) {
    const companyId = req.tenant?.companyId;
    if (!companyId) {
      return res.status(401).json({ error: 'Выберите компанию для продолжения' });
    }
    const enabled = await hasModuleAccess(companyId, moduleKey);
    if (!enabled) {
      return res.status(403).json({ error: 'Модуль не подключён для этой компании' });
    }
    next();
  };
}

module.exports = { getCurrentUser, getCurrentCompany, hasModuleAccess, requireModule, logEvent };
