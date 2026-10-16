const pool = require('../db/pool');

// Доступ текущего пользователя к пульту сети (16.10.2026): владелец
// компании-владельца сети — полный (canManage), администратор той же
// компании с выданным доступом (franchise_group_viewers) — только просмотр.
// Остальным — null. Используют franchise.routes.js и franchise-tasks.routes.js.
async function networkAccess(req) {
  const { rows } = await pool.query('SELECT id, name, join_code FROM franchise_groups WHERE owner_company_id = $1', [req.tenant.companyId]);
  const group = rows[0];
  if (!group) return null;
  if (req.tenant.role === 'owner') return { group, canManage: true };
  if (req.tenant.role === 'admin') {
    const { rows: viewer } = await pool.query(
      'SELECT 1 FROM franchise_group_viewers WHERE franchise_group_id = $1 AND membership_id = $2',
      [group.id, req.tenant.membershipId]
    );
    if (viewer.length > 0) return { group, canManage: false };
  }
  return null;
}

module.exports = { networkAccess };
