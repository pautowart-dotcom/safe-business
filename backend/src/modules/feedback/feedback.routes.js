const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../core/middleware/role');
const { logEvent } = require('../../core/eventLog');

const router = express.Router();

// Читает входящие сообщения только владелец — обратная связь односторонняя
// (мастер -> владелец), README: "Обратная связь передаётся владельцу".
router.get(
  '/',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT f.id, f.message, f.read, f.created_at, u.name AS from_name
       FROM feedback_messages f
       JOIN memberships m ON m.id = f.from_membership_id
       LEFT JOIN users u ON u.id = m.user_id
       WHERE f.company_id = $1 ORDER BY f.created_at DESC`,
      [req.tenant.companyId]
    );
    res.json(rows);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Напишите сообщение' });
    }
    const { rows } = await pool.query(
      `INSERT INTO feedback_messages (company_id, from_membership_id, message)
       VALUES ($1, $2, $3) RETURNING id, message, read, created_at`,
      [req.tenant.companyId, req.tenant.membershipId, message.trim()]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'feedback',
      userId: req.user.id,
      entityType: 'feedback_message',
      entityId: rows[0].id,
      action: 'feedback_message.sent',
    });

    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE feedback_messages SET read = true WHERE id = $1 AND company_id = $2
       RETURNING id, message, read, created_at`,
      [req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Сообщение не найдено' });
    res.json(rows[0]);
  })
);

module.exports = router;
