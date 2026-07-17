const express = require('express');
const pool = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { from, to, status, master_id } = req.query;
    const conditions = [];
    const params = [];
    let i = 1;

    // Мастер по умолчанию видит только свои визиты, владелец - все
    if (req.user.role === 'master') {
      conditions.push(`v.master_id = $${i++}`);
      params.push(req.user.id);
    } else if (master_id) {
      conditions.push(`v.master_id = $${i++}`);
      params.push(master_id);
    }
    if (from) { conditions.push(`v.scheduled_at >= $${i++}`); params.push(from); }
    if (to) { conditions.push(`v.scheduled_at <= $${i++}`); params.push(to); }
    if (status) { conditions.push(`v.status = $${i++}`); params.push(status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT v.*, c.name AS client_name, c.phone AS client_phone, u.name AS master_name
       FROM visits v
       JOIN clients c ON c.id = v.client_id
       LEFT JOIN users u ON u.id = v.master_id
       ${where}
       ORDER BY v.scheduled_at DESC`,
      params
    );
    res.json(result.rows);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { client_id, master_id, service, scheduled_at, duration_minutes, price, notes } = req.body;
    if (!client_id || !service || !scheduled_at) {
      return res.status(400).json({ error: 'Укажите клиента, услугу и дату визита' });
    }
    const effectiveMaster = req.user.role === 'master' ? req.user.id : master_id || null;
    const result = await pool.query(
      `INSERT INTO visits (client_id, master_id, service, scheduled_at, duration_minutes, price, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [client_id, effectiveMaster, service, scheduled_at, duration_minutes || 60, price || 0, notes || null]
    );
    res.status(201).json(result.rows[0]);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { service, scheduled_at, duration_minutes, price, notes, master_id, status } = req.body;
    const existing = await pool.query('SELECT * FROM visits WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Визит не найден' });
    }
    const visit = existing.rows[0];
    if (req.user.role === 'master' && visit.master_id !== req.user.id) {
      return res.status(403).json({ error: 'Можно редактировать только свои визиты' });
    }

    const result = await pool.query(
      `UPDATE visits SET
        service = COALESCE($1, service),
        scheduled_at = COALESCE($2, scheduled_at),
        duration_minutes = COALESCE($3, duration_minutes),
        price = COALESCE($4, price),
        notes = $5,
        master_id = COALESCE($6, master_id),
        status = COALESCE($7, status)
       WHERE id = $8 RETURNING *`,
      [service, scheduled_at, duration_minutes, price, notes, master_id, status, req.params.id]
    );
    const updated = result.rows[0];

    // При переходе визита в "завершён" автоматически создаём доход в финансах
    if (status === 'completed' && visit.status !== 'completed') {
      const already = await pool.query(
        'SELECT id FROM finance_transactions WHERE visit_id = $1',
        [req.params.id]
      );
      if (already.rows.length === 0) {
        await pool.query(
          `INSERT INTO finance_transactions (type, amount, category, description, visit_id, created_by)
           VALUES ('income', $1, 'Услуги', $2, $3, $4)`,
          [updated.price, `Визит: ${updated.service}`, req.params.id, req.user.id]
        );
      }
    }

    res.json(updated);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await pool.query('SELECT master_id FROM visits WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Визит не найден' });
    }
    if (req.user.role === 'master' && existing.rows[0].master_id !== req.user.id) {
      return res.status(403).json({ error: 'Можно удалять только свои визиты' });
    }
    await pool.query('DELETE FROM visits WHERE id = $1', [req.params.id]);
    res.status(204).end();
  })
);

module.exports = router;
