const pool = require('../../db/pool');
const { logEvent } = require('../../core/eventLog');

// Единая логика создания записи о переменном расходе — раньше жила только
// внутри POST /expenses (expense-entries.routes.js). Вынесена сюда
// (19.08.2026), чтобы инструмент create_expense ИИ-ассистента
// (modules/ai-assistant/tools/registry.js) писал в БД через ТОТ ЖЕ путь
// валидации и тот же INSERT + event_log, а не дублировал SQL — так
// ассистент физически не может создать запись мимо проверенной логики
// обычной формы. Это единственное намеренное отступление от правила
// core/sdk.js ("модуль никогда не импортирует код другого модуля напрямую")
// — цена дублирования SQL для одной и той же записи в БД показалась выше
// цены точечного прямого require между двумя конкретными модулями.
async function createExpenseEntry({ companyId, userId, name, amount, occurredAt, category, channel }) {
  if (!name || amount === undefined || amount === null || amount === '') {
    const err = new Error('Укажите название и сумму расхода');
    err.status = 400;
    throw err;
  }

  const { rows } = await pool.query(
    `INSERT INTO expense_entries (company_id, name, amount, occurred_at, created_by_user_id, category, channel)
     VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5, $6, $7)
     RETURNING id, name, amount, category, channel, occurred_at, created_at`,
    [companyId, name, amount, occurredAt || null, userId, category || null, channel || null]
  );
  const row = rows[0];

  await logEvent({
    companyId,
    moduleKey: 'finance',
    userId,
    entityType: 'expense_entry',
    entityId: row.id,
    action: 'expense_entry.created',
  });

  return row;
}

module.exports = { createExpenseEntry };
