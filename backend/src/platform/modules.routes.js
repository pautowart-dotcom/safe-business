const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { logEvent } = require('../core/eventLog');

const router = express.Router();

router.use(requireAuth, requireTenant);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT m.key, m.name, m.description, m.icon, m.category,
              COALESCE(cm.enabled, false) AS enabled
       FROM modules m
       LEFT JOIN company_modules cm ON cm.module_key = m.key AND cm.company_id = $1
       ORDER BY m.category, m.name`,
      [req.tenant.companyId]
    );
    res.json(rows);
  })
);

router.post(
  '/:key/enable',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    await pool.query(
      `INSERT INTO company_modules (company_id, module_key, enabled, enabled_at)
       VALUES ($1, $2, true, now())
       ON CONFLICT (company_id, module_key) DO UPDATE SET enabled = true, enabled_at = now()`,
      [req.tenant.companyId, req.params.key]
    );
    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'company_module',
      action: 'module.enabled',
      payload: { moduleKey: req.params.key },
    });
    res.status(204).end();
  })
);

router.post(
  '/:key/disable',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    await pool.query(
      `INSERT INTO company_modules (company_id, module_key, enabled)
       VALUES ($1, $2, false)
       ON CONFLICT (company_id, module_key) DO UPDATE SET enabled = false`,
      [req.tenant.companyId, req.params.key]
    );
    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'company_module',
      action: 'module.disabled',
      payload: { moduleKey: req.params.key },
    });
    res.status(204).end();
  })
);

module.exports = router;
