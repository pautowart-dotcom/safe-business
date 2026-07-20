const pool = require('../db/pool');

// Пакет 2, Этап 9 п.2: узкий аудит-лог только чувствительных действий
// (удаление записей, изменение прав доступа, создание/удаление компании) —
// в отличие от eventLog.js (общий поток для будущей ИИ-аналитики), сюда
// пишется явно и по одному вызову на каждое такое действие, не автоматически.
async function logAudit({ companyId = null, userId = null, action, entityType, entityId = null }) {
  await pool.query(
    `INSERT INTO audit_log (company_id, user_id, action, entity_type, entity_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [companyId, userId, action, entityType, entityId]
  );
}

module.exports = { logAudit };
