const pool = require('../db/pool');

// Единая точка регистрации сроков для любого модуля (Пакет 3, Этап 2).
// upsert по (relatedEntityType, relatedEntityId, category) — повторный вызов
// с той же сущностью (например, дата мед. книжки сотрудника изменилась)
// обновляет срок вместо создания дубликата. Без related-привязки каждый
// вызов создаёт новую запись.
async function registerDeadline({ companyId, category, title, dueDate, relatedEntityType = null, relatedEntityId = null }) {
  if (relatedEntityType && relatedEntityId) {
    const { rows } = await pool.query(
      `INSERT INTO deadlines (company_id, category, title, due_date, related_entity_type, related_entity_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (related_entity_type, related_entity_id, category) WHERE related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL
       DO UPDATE SET title = EXCLUDED.title, due_date = EXCLUDED.due_date, status = 'pending'
       RETURNING id`,
      [companyId, category, title, dueDate, relatedEntityType, relatedEntityId]
    );
    return rows[0].id;
  }

  const { rows } = await pool.query(
    `INSERT INTO deadlines (company_id, category, title, due_date)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [companyId, category, title, dueDate]
  );
  return rows[0].id;
}

module.exports = { registerDeadline };
