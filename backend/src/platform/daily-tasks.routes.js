const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');

const router = express.Router();
router.use(requireAuth, requireTenant, requireRole('owner', 'admin'));

// "Задачи на сегодня" (Этап 7) — личный список каждого владельца/админа,
// не общий на компанию (двое админов не видят чужие пункты). Без даты —
// это не привязанный к конкретному дню список дел, владелец сам решает,
// когда отметить/удалить пункт.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT id, text, done, created_at FROM daily_tasks WHERE membership_id = $1 ORDER BY done, created_at',
      [req.tenant.membershipId]
    );
    res.json(rows);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Укажите текст задачи' });
    }
    const { rows } = await pool.query(
      `INSERT INTO daily_tasks (company_id, membership_id, text)
       VALUES ($1, $2, $3) RETURNING id, text, done, created_at`,
      [req.tenant.companyId, req.tenant.membershipId, text.trim()]
    );
    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { done, text } = req.body;
    const { rows } = await pool.query(
      `UPDATE daily_tasks SET done = COALESCE($1, done), text = COALESCE($2, text)
       WHERE id = $3 AND membership_id = $4
       RETURNING id, text, done, created_at`,
      [done === undefined ? null : !!done, text || null, req.params.id, req.tenant.membershipId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }
    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM daily_tasks WHERE id = $1 AND membership_id = $2', [
      req.params.id,
      req.tenant.membershipId,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }
    res.status(204).end();
  })
);

module.exports = router;
