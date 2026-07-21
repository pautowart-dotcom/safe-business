const pool = require('../db/pool');
const { sendPushToCompany } = require('./pushNotify');

// Единая точка регистрации сроков для любого модуля (Пакет 3, Этап 2).
// upsert по (relatedEntityType, relatedEntityId, category) — повторный вызов
// с той же сущностью (например, дата мед. книжки сотрудника изменилась)
// обновляет срок вместо создания дубликата. Без related-привязки каждый
// вызов создаёт новую запись.
//
// Пакет 3, Этап 9: push шлём, только когда строка реально ВСТАВЛЕНА
// (xmax = 0 — стандартный приём Postgres отличить INSERT от UPDATE в
// ON CONFLICT DO UPDATE), а не при каждом повторном sync — иначе,
// например, каждое сохранение налогового режима в Настройках (Этап 4,
// syncTaxDeadlines пересобирает все слоты) заново слало бы уведомления по
// уже существующим срокам.
async function registerDeadline({ companyId, category, title, dueDate, relatedEntityType = null, relatedEntityId = null }) {
  let id;
  let inserted;

  if (relatedEntityType && relatedEntityId) {
    const { rows } = await pool.query(
      `INSERT INTO deadlines (company_id, category, title, due_date, related_entity_type, related_entity_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (related_entity_type, related_entity_id, category) WHERE related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL
       DO UPDATE SET title = EXCLUDED.title, due_date = EXCLUDED.due_date, status = 'pending'
       RETURNING id, (xmax = 0) AS inserted`,
      [companyId, category, title, dueDate, relatedEntityType, relatedEntityId]
    );
    id = rows[0].id;
    inserted = rows[0].inserted;
  } else {
    const { rows } = await pool.query(
      `INSERT INTO deadlines (company_id, category, title, due_date)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [companyId, category, title, dueDate]
    );
    id = rows[0].id;
    inserted = true;
  }

  // Пуш — побочный эффект, не должен ронять регистрацию дедлайна (которая
  // уже успешно записана в БД), если push-служба браузера недоступна или
  // отвечает ошибкой, не связанной с самой подпиской.
  if (inserted) {
    sendPushToCompany({
      companyId,
      category,
      title: 'Новый срок в "Дедлайнах"',
      body: title,
      url: '/deadlines',
    }).catch((err) => console.error('sendPushToCompany failed:', err));
  }

  return id;
}

module.exports = { registerDeadline };
