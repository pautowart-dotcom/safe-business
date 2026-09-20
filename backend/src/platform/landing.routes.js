// Анонимный счётчик визитов лендинга — без IP/user-agent/cookies, только
// факт визита + необязательные UTM-метки из ссылки (см. migrations/0064).
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { createRateLimiter } = require('../core/rateLimit');

const router = express.Router();

function truncate(value) {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, 200) : null;
}

// 20 в минуту на IP (на воркер): счётчик нужен для людей, не для
// накрутки таблицы landing_visits.
router.post(
  '/visit',
  createRateLimiter({ windowMs: 60 * 1000, max: 20 }),
  asyncHandler(async (req, res) => {
    const { utm_source, utm_medium, utm_campaign } = req.body || {};
    await pool.query(
      `INSERT INTO landing_visits (utm_source, utm_medium, utm_campaign) VALUES ($1, $2, $3)`,
      [truncate(utm_source), truncate(utm_medium), truncate(utm_campaign)]
    );
    res.status(201).json({ ok: true });
  })
);

module.exports = router;
