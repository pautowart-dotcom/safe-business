// «Мои точки» (16.10.2026, docs/franchise-funkcional.md §11, этап 5: Ф3/Ф4)
// — сводка по всем точкам, где человек владелец или администратор
// (управляющий нескольких точек = администратор, приглашённый в каждую
// точку через «Команду»). Только свои активные членства пользователя.
//
// Индекс и зону показываем только там, где человек владелец: данные теста
// безопасности администратору не видны (политика конфиденциальности §8.4,
// тот же принцип, что ownerOnly у раздела «Безопасность»). Администратору —
// сроки и шаг открытия.
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { computeSecurityStatus } = require('../modules/security/status');
const { getOpening } = require('../modules/roadmap/opening');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows: memberships } = await pool.query(
      `SELECT m.role, c.id AS company_id, c.name, fg.name AS network_name
       FROM memberships m
       JOIN companies c ON c.id = m.company_id
       LEFT JOIN franchise_groups fg ON fg.id = c.franchise_group_id
       WHERE m.user_id = $1 AND m.invite_status = 'active' AND m.active = true AND m.role IN ('owner', 'admin')
       ORDER BY c.name`,
      [req.user.id]
    );
    const ids = memberships.map((m) => m.company_id);
    const { rows: deadlineRows } = ids.length
      ? await pool.query(
          `SELECT company_id, count(*)::int AS n FROM deadlines
           WHERE company_id = ANY($1) AND status = 'pending' AND due_date <= CURRENT_DATE
           GROUP BY company_id`,
          [ids]
        )
      : { rows: [] };
    const dueByCompany = new Map(deadlineRows.map((r) => [r.company_id, r.n]));

    const points = await Promise.all(
      memberships.map(async (m) => {
        const opening = await getOpening(m.company_id);
        const point = {
          companyId: m.company_id,
          companyName: m.name,
          role: m.role,
          networkName: m.network_name,
          deadlinesDue: dueByCompany.get(m.company_id) || 0,
          opening: opening?.status === 'preparing' ? { done: opening.done, total: opening.total, currentStage: opening.currentStage } : null,
          indexPercent: null,
          zone: null,
        };
        if (m.role === 'owner') {
          const status = await computeSecurityStatus(m.company_id);
          point.indexPercent = status.indexPercent;
          point.zone = status.zone;
        }
        return point;
      })
    );
    res.json(points);
  })
);

module.exports = router;
