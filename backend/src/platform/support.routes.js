const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');

const router = express.Router();

// Только requireAuth (не requireTenant) — обращение в поддержку не должно
// зависеть от того, выбрана ли уже компания в текущей сессии.
router.use(requireAuth);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { message, email } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Опишите вопрос или проблему' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Укажите email для ответа' });
    }
    const companyId = req.authSession?.companyId || null;
    const { rows } = await pool.query(
      `INSERT INTO support_requests (user_id, company_id, email, message)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [req.user.id, companyId, email.trim(), message.trim()]
    );
    res.status(201).json(rows[0]);
  })
);

module.exports = router;
