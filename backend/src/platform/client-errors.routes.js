// Баг №1 (белый экран): временный приёмник диагностики от ErrorBoundary —
// см. migrations/0040_client_error_reports.sql. Без requireAuth: краш может
// произойти и до логина (например, на самом /login), терять эти случаи
// нельзя. user_id проставляется, только если токен есть и валиден.
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../core/jwt');
const { requireAuth } = require('../core/middleware/auth');
const { requireSuperAdmin } = require('../core/middleware/role');

const router = express.Router();

function tryGetUserId(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  try {
    return verifyToken(header.slice('Bearer '.length)).sub;
  } catch (err) {
    return null;
  }
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { message, stack, componentStack, route, standalone } = req.body || {};
    await pool.query(
      `INSERT INTO client_error_reports (message, stack, component_stack, route, user_agent, user_id, standalone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        message || null,
        stack || null,
        componentStack || null,
        route || null,
        req.headers['user-agent'] || null,
        tryGetUserId(req),
        standalone === undefined ? null : !!standalone,
      ]
    );
    res.status(201).json({ ok: true });
  })
);

// Просмотр — только Super Admin (Артём), без выбора компании (как и
// остальная админ-панель) — это диагностика всей платформы, не одной студии.
router.get(
  '/',
  requireAuth,
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, message, stack, component_stack, route, user_agent, user_id, standalone, created_at
       FROM client_error_reports ORDER BY created_at DESC LIMIT 100`
    );
    res.json(rows);
  })
);

module.exports = router;
