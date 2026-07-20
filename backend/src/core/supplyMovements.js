// Списание/приход остатка расходника внутри уже открытой транзакции
// (client с активным BEGIN). Используется модулем "Расходники" (кнопки
// Пришло/Списать) и модулем "Визиты" (авто-списание расходников,
// отмеченных в визите) — вынесено в core, а не в один из модулей, так как
// модули не импортируют код друг друга напрямую (см. core/sdk.js).
// FOR UPDATE — защита от гонки при одновременном списании одного и того
// же расходника из разных визитов/запросов.
async function applySupplyMovement(client, { companyId, supplyId, type, quantity, userId }) {
  const supply = await client.query(
    'SELECT id, name, quantity FROM supplies WHERE id = $1 AND company_id = $2 FOR UPDATE',
    [supplyId, companyId]
  );
  if (supply.rows.length === 0) {
    return { status: 'not_found' };
  }

  const current = parseFloat(supply.rows[0].quantity);
  if (type === 'out' && current < quantity) {
    return { status: 'insufficient', name: supply.rows[0].name };
  }

  const delta = type === 'in' ? quantity : -quantity;
  await client.query('UPDATE supplies SET quantity = quantity + $1 WHERE id = $2', [delta, supplyId]);
  await client.query(
    `INSERT INTO supply_movements (company_id, supply_id, type, quantity, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [companyId, supplyId, type, quantity, userId]
  );
  return { status: 'ok' };
}

module.exports = { applySupplyMovement };
