const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');

const router = express.Router();

router.use(requireAuth, requireTenant);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT id, name, address, created_at FROM branches WHERE company_id = $1 ORDER BY name',
      [req.tenant.companyId]
    );
    res.json(rows);
  })
);

router.post(
  '/',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { name, address } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Укажите название филиала' });
    }
    const { rows } = await pool.query(
      'INSERT INTO branches (company_id, name, address) VALUES ($1, $2, $3) RETURNING id, name, address, created_at',
      [req.tenant.companyId, name, address || null]
    );
    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { name, address } = req.body;
    const { rows } = await pool.query(
      `UPDATE branches SET name = COALESCE($1, name), address = COALESCE($2, address)
       WHERE id = $3 AND company_id = $4
       RETURNING id, name, address, created_at`,
      [name || null, address || null, req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Филиал не найден' });
    }
    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM branches WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Филиал не найден' });
    }
    res.status(204).end();
  })
);

module.exports = router;
