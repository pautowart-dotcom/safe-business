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
async function registerDeadline({
  companyId, category, title, dueDate, relatedEntityType = null, relatedEntityId = null, note = null, recurrence = null, fileUrl = null,
}) {
  let id;
  let inserted;

  // fileUrl — null означает "этот вызов не трогает файл", не "удалить файл"
  // (иначе, например, сохранение одной только заметки в "Мои сроки" стирало
  // бы уже прикреплённое фото). COALESCE($9, deadlines.file_url) в апдейте
  // сохраняет прежний файл, пока не передан новый.
  if (relatedEntityType && relatedEntityId) {
    const { rows } = await pool.query(
      `INSERT INTO deadlines (company_id, category, title, due_date, kind, related_entity_type, related_entity_id, note, recurrence, file_url)
       VALUES ($1, $2, $3, $4, 'deadline', $5, $6, $7, $8, $9)
       ON CONFLICT (related_entity_type, related_entity_id, category) WHERE related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL
       DO UPDATE SET title = EXCLUDED.title, due_date = EXCLUDED.due_date, kind = 'deadline', status = 'pending', note = EXCLUDED.note, recurrence = EXCLUDED.recurrence,
                     file_url = COALESCE($9, deadlines.file_url)
       RETURNING id, (xmax = 0) AS inserted`,
      [companyId, category, title, dueDate, relatedEntityType, relatedEntityId, note, recurrence, fileUrl]
    );
    id = rows[0].id;
    inserted = rows[0].inserted;
  } else {
    const { rows } = await pool.query(
      `INSERT INTO deadlines (company_id, category, title, due_date, kind, note, recurrence, file_url)
       VALUES ($1, $2, $3, $4, 'deadline', $5, $6, $7) RETURNING id`,
      [companyId, category, title, dueDate, note, recurrence, fileUrl]
    );
    id = rows[0].id;
    inserted = true;
  }

  // Пуш — побочный эффект, не должен ронять регистрацию дедлайна (которая
  // уже успешно записана в БД), если push-служба браузера недоступна или
  // отвечает ошибкой, не связанной с самой подпиской.
  // 15.08.2026: раньше заголовок пуша был общей обёрткой ("Новый срок в
  // Дедлайнах"), а самое важное (что именно за срок) пряталось в тело —
  // на iOS это выглядело как "Новый срок в Дедлайнах / from Безопасный
  // бизнес / <суть>", много лишнего текста сверху. Имя приложения ("from
  // ...") рисует сама ОС из имени PWA, дублировать его в заголовке не
  // нужно — поэтому в заголовок идёт сама суть, а не обёртка.
  if (inserted) {
    sendPushToCompany({
      companyId,
      category,
      title,
      body: 'Новый срок — подробности в «Дедлайнах»',
      url: '/deadlines',
    }).catch((err) => console.error('sendPushToCompany failed:', err));
  }

  return id;
}

// Пакет 4, Этап 1: "Действия" — тот же движок, но для условий без точной
// даты ("не пройден тест", "кончаются расходники", "не заполнен журнал за
// сегодня"). due_date всегда NULL (см. deadlines_kind_due_date_check в
// миграции 0036) — конкретные модули, которые начнут вызывать эту функцию
// в следующих этапах, сами решают, когда условие снято (и тогда чистят
// запись через clearAction, а не оставляют её висеть вечно).
async function registerAction({ companyId, category, title, relatedEntityType = null, relatedEntityId = null }) {
  let id;
  let inserted;

  if (relatedEntityType && relatedEntityId) {
    const { rows } = await pool.query(
      `INSERT INTO deadlines (company_id, category, title, due_date, kind, related_entity_type, related_entity_id)
       VALUES ($1, $2, $3, NULL, 'action', $4, $5)
       ON CONFLICT (related_entity_type, related_entity_id, category) WHERE related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL
       DO UPDATE SET title = EXCLUDED.title, kind = 'action', due_date = NULL, status = 'pending'
       RETURNING id, (xmax = 0) AS inserted`,
      [companyId, category, title, relatedEntityType, relatedEntityId]
    );
    id = rows[0].id;
    inserted = rows[0].inserted;
  } else {
    const { rows } = await pool.query(
      `INSERT INTO deadlines (company_id, category, title, due_date, kind)
       VALUES ($1, $2, $3, NULL, 'action') RETURNING id`,
      [companyId, category, title]
    );
    id = rows[0].id;
    inserted = true;
  }

  if (inserted) {
    sendPushToCompany({
      companyId,
      category,
      title,
      body: 'Подробности — в «Дедлайнах»',
      url: '/deadlines',
    }).catch((err) => console.error('sendPushToCompany failed:', err));
  }

  return id;
}

// Снять действие/дедлайн, когда условие-источник больше не выполняется
// (например, расходник снова в достатке) — без этого запись висела бы в
// списке бессрочно. related-привязка обязательна: без неё нечем было бы
// однозначно найти, какую запись убирать.
async function clearAction({ relatedEntityType, relatedEntityId, category }) {
  await pool.query(
    'DELETE FROM deadlines WHERE related_entity_type = $1 AND related_entity_id = $2 AND category = $3',
    [relatedEntityType, relatedEntityId, category]
  );
}

// Вынесено из deadlines.routes.js (03.09.2026) — нужно второй точке вызова
// (лента наблюдения, watch-feed.routes.js) без дублирования тех же правил:
// налоговые сроки скрыты от Администратора, "Журналы" заморожены целиком
// (05.08.2026, см. комментарии в deadlines.routes.js). GET /platform/deadlines
// теперь тоже вызывает эту функцию, а не держит копию SQL.
async function listUpcomingDeadlines(companyId, { role, category, kind, status } = {}) {
  if (category === 'tax' && role === 'admin') return [];
  if (category === 'journals') return [];

  const params = [companyId];
  let where = "company_id = $1 AND category != 'journals'";

  if (category) {
    params.push(category);
    where += ` AND category = $${params.length}`;
  } else if (role === 'admin') {
    where += ` AND category != 'tax'`;
  }
  if (kind) {
    params.push(kind);
    where += ` AND kind = $${params.length}`;
  }
  params.push(status || 'pending');
  where += ` AND status = $${params.length}`;

  const { rows } = await pool.query(
    `SELECT id, category, title, kind, to_char(due_date, 'YYYY-MM-DD') AS due_date, status,
            related_entity_type, related_entity_id, note, recurrence, created_at
     FROM deadlines WHERE ${where} ORDER BY due_date ASC NULLS LAST, id ASC`,
    params
  );
  return rows;
}

const RECURRENCE_MONTHS = { monthly: 1, quarterly: 3, half_year: 6, yearly: 12 };

// Сдвиг даты на следующий период — используется в deadlines.routes.js при
// отметке "Готово" на дедлайне с периодичностью (Пакет 4, Этап 2), чтобы
// периодичность реально что-то делала, а не была декоративным полем.
function nextDueDate(dueDate, recurrence) {
  const months = RECURRENCE_MONTHS[recurrence];
  if (!months) return null;
  const d = new Date(`${dueDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

module.exports = { registerDeadline, registerAction, clearAction, nextDueDate, listUpcomingDeadlines };
