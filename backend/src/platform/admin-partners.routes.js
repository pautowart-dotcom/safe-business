const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireSuperAdmin } = require('../core/middleware/role');

const router = express.Router();
router.use(requireAuth, requireSuperAdmin);

const STATUS = {
  person: 'Физическое лицо',
  self_employed: 'Самозанятый',
  ip: 'ИП',
  ooo: 'Организация',
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT p.id, p.user_id, p.code, p.discount_percent, p.legal_status, p.inn, p.legal_name, p.phone,
              p.payout_details, p.terms_accepted_at, p.created_at, u.name, u.email,
              (SELECT COUNT(*) FROM partner_visits v WHERE v.partner_id = p.id)::int AS arrived,
              (SELECT COUNT(*) FROM partner_accruals a WHERE a.partner_id = p.id AND a.status <> 'void')::int AS payments,
              (SELECT COALESCE(SUM(share_rub), 0) FROM partner_accruals a WHERE a.partner_id = p.id AND a.status <> 'void')::int AS earned_rub,
              (SELECT COALESCE(SUM(share_rub), 0) FROM partner_accruals a WHERE a.partner_id = p.id AND a.status = 'hold' AND a.hold_until <= now())::int AS ready_rub
       FROM partner_profiles p
       JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC`
    );
    res.json(rows.map((row) => ({ ...row, legalStatusLabel: STATUS[row.legal_status] || row.legal_status })));
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT p.*, u.name, u.email
       FROM partner_profiles p JOIN users u ON u.id = p.user_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Партнёр не найден' });
    const accruals = await pool.query(
      `SELECT id, source, amount_rub, share_rub, status, hold_until, created_at
       FROM partner_accruals WHERE partner_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    const partner = rows[0];
    partner.legalStatusLabel = STATUS[partner.legal_status] || partner.legal_status;
    res.json({ partner, accruals: accruals.rows });
  })
);

router.post(
  '/:id/mark-paid',
  asyncHandler(async (req, res) => {
    const partner = await pool.query('SELECT legal_status FROM partner_profiles WHERE id = $1', [req.params.id]);
    if (!partner.rows[0]) return res.status(404).json({ error: 'Партнёр не найден' });
    if (partner.rows[0].legal_status === 'person') {
      return res.status(400).json({ error: 'Физическому лицу без статуса самозанятого, ИП или организации не платим. Сначала пусть сменит статус.' });
    }
    const { rows } = await pool.query(
      `UPDATE partner_accruals
       SET status = 'paid'
       WHERE partner_id = $1 AND status = 'hold' AND hold_until <= now()
       RETURNING share_rub`,
      [req.params.id]
    );
    const sum = rows.reduce((acc, row) => acc + row.share_rub, 0);
    res.json({ count: rows.length, sumRub: sum });
  })
);

module.exports = router;
