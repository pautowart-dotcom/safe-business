const pool = require('../../db/pool');
const { logEvent } = require('../../core/eventLog');

// Единая логика создания ручной записи о выручке — вынесена из POST
// /revenue (revenue.routes.js) 19.08.2026, тот же принцип, что уже применён
// к expense-entries.service.js: инструмент create_income ИИ-ассистента
// (modules/ai-assistant/tools/registry.js) должен писать через ТОТ ЖЕ путь,
// что обычная форма, а не дублировать INSERT — см. подробное обоснование в
// комментарии expense-entries.service.js, здесь та же логика один в один.
async function createRevenueEntry({ companyId, userId, amount, occurredAt, comment, membershipId }) {
  if (amount === undefined || amount === null || amount === '') {
    const err = new Error('Укажите сумму выручки');
    err.status = 400;
    throw err;
  }

  if (membershipId) {
    const master = await pool.query(`SELECT 1 FROM memberships WHERE id = $1 AND company_id = $2`, [membershipId, companyId]);
    if (master.rows.length === 0) {
      const err = new Error('Сотрудник не найден в этой компании');
      err.status = 400;
      throw err;
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO finance_entries (company_id, source, membership_id, amount, comment, occurred_at, created_by_user_id)
     VALUES ($1, 'manual', $2, $3, $4, COALESCE($5, CURRENT_DATE), $6)
     RETURNING id, source, visit_id, membership_id, amount, comment, occurred_at, created_at`,
    [companyId, membershipId || null, amount, comment || null, occurredAt || null, userId]
  );
  const row = rows[0];

  await logEvent({
    companyId,
    moduleKey: 'finance',
    userId,
    entityType: 'finance_entry',
    entityId: row.id,
    action: 'finance_entry.created',
  });

  return row;
}

module.exports = { createRevenueEntry };
