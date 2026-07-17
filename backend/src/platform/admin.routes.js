// Панель Super Admin: обзор всех компаний платформы (docs/task.md, п.1).
// Не требует requireTenant — доступ Super Admin не зависит от членства в компании.
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireSuperAdmin } = require('../core/middleware/role');

const router = express.Router();

router.use(requireAuth, requireSuperAdmin);

router.get(
  '/companies',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.industry_segment, c.subscription_status, c.trial_ends_at, c.created_at,
              (SELECT COUNT(*) FROM branches b WHERE b.company_id = c.id) AS branch_count,
              (SELECT COUNT(*) FROM memberships m WHERE m.company_id = c.id AND m.invite_status = 'active') AS member_count
       FROM companies c
       ORDER BY c.created_at DESC`
    );
    res.json(rows);
  })
);

router.get(
  '/companies/:id',
  asyncHandler(async (req, res) => {
    const companyResult = await pool.query(
      'SELECT id, name, industry_segment, subscription_status, trial_ends_at, created_at FROM companies WHERE id = $1',
      [req.params.id]
    );
    if (companyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Компания не найдена' });
    }

    const [branches, memberships, modules] = await Promise.all([
      pool.query('SELECT id, name, address, created_at FROM branches WHERE company_id = $1 ORDER BY name', [
        req.params.id,
      ]),
      pool.query(
        `SELECT m.id, m.role, m.branch_id, m.invite_status, u.name AS user_name, u.email AS user_email
         FROM memberships m LEFT JOIN users u ON u.id = m.user_id
         WHERE m.company_id = $1 ORDER BY m.created_at`,
        [req.params.id]
      ),
      pool.query(
        `SELECT module_key, enabled, enabled_at FROM company_modules WHERE company_id = $1 ORDER BY module_key`,
        [req.params.id]
      ),
    ]);

    res.json({
      company: companyResult.rows[0],
      branches: branches.rows,
      memberships: memberships.rows,
      modules: modules.rows,
    });
  })
);

module.exports = router;
