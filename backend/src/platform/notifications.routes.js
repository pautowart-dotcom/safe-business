// Раздел «Уведомления» (Ж2, 14.10.2026) — список и отметка «прочитано».
// Экран — Ж3. Налоговые уведомления скрыты от Администратора — та же
// политика, что у самих налоговых сроков (core/deadlines.js) и push
// (core/pushNotify.js).
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');

const router = express.Router();
router.use(requireAuth, requireTenant);

const LIST_LIMIT = 50;

function roleFilter(role) {
  // outside_watch (22.10.2026) — события из реестров про самого владельца
  // (суды, приставы), Администратору их не показываем.
  return role === 'admin' ? `AND (category IS NULL OR category NOT IN ('tax', 'outside_watch'))` : '';
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = roleFilter(req.tenant.role);
    const [{ rows: items }, { rows: unread }] = await Promise.all([
      pool.query(
        `SELECT id, kind, category, title, body, url, created_at AS "createdAt", read_at AS "readAt"
         FROM company_notifications WHERE company_id = $1 ${filter}
         ORDER BY created_at DESC, id DESC LIMIT ${LIST_LIMIT}`,
        [req.tenant.companyId]
      ),
      pool.query(
        `SELECT count(*)::int AS n FROM company_notifications WHERE company_id = $1 AND read_at IS NULL ${filter}`,
        [req.tenant.companyId]
      ),
    ]);
    res.json({ items, unreadCount: unread[0].n });
  })
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      `UPDATE company_notifications SET read_at = COALESCE(read_at, now())
       WHERE id = $1 AND company_id = $2 ${roleFilter(req.tenant.role)}`,
      [req.params.id, req.tenant.companyId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Уведомление не найдено' });
    res.json({ ok: true });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await pool.query(
      `UPDATE company_notifications SET read_at = now()
       WHERE company_id = $1 AND read_at IS NULL ${roleFilter(req.tenant.role)}`,
      [req.tenant.companyId]
    );
    res.json({ ok: true });
  })
);

module.exports = router;
