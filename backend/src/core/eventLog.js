const pool = require('../db/pool');

async function logEvent({ companyId = null, moduleKey, userId = null, entityType, entityId = null, action, payload = {} }) {
  await pool.query(
    `INSERT INTO event_log (company_id, module_key, user_id, entity_type, entity_id, action, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [companyId, moduleKey, userId, entityType, entityId, action, payload]
  );
}

module.exports = { logEvent };
