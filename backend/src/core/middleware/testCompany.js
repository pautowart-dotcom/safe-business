const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');

// Тихая обкатка фич (10.08.2026) — is_test проставляется вручную владельцем
// через /office (PATCH /admin/companies/:id/test-flag, миграция 0067).
// Единственное, что нужно сделать, когда решим показать фичу всем —
// убрать этот middleware из соответствующего роута.
const requireTestCompany = asyncHandler(async (req, res, next) => {
  const { rows } = await pool.query('SELECT is_test FROM companies WHERE id = $1', [req.tenant.companyId]);
  if (!rows[0]?.is_test) return res.status(404).json({ error: 'Маршрут не найден' });
  next();
});

module.exports = { requireTestCompany };
