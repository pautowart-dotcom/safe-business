// Анонимный счётчик визитов лендинга — без IP/user-agent/cookies, только
// факт визита + необязательные UTM-метки из ссылки (см. migrations/0064).
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

function truncate(value) {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, 200) : null;
}

router.post(
  '/visit',
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
