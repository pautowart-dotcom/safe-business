const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../core/middleware/role');
const { logEvent } = require('../../core/eventLog');

const router = express.Router();

// Премии/вычеты — ручная запись владельца, не считается формулой (Этап 6).
// Мастер видит только свои, владелец — все или по конкретному мастеру.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const params = [req.tenant.companyId];
    let where = 'fa.company_id = $1';

    if (req.tenant.role === 'master') {
      params.push(req.tenant.membershipId);
      where += ` AND fa.master_membership_id = $${params.length}`;
    } else if (req.query.masterMembershipId) {
      params.push(req.query.masterMembershipId);
      where += ` AND fa.master_membership_id = $${params.length}`;
    }

    if (req.query.dateFrom) {
      params.push(req.query.dateFrom);
      where += ` AND fa.occurred_at >= $${params.length}`;
    }
    if (req.query.dateTo) {
      params.push(req.query.dateTo);
      where += ` AND fa.occurred_at <= $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT fa.id, fa.master_membership_id, u.name AS master_name, fa.amount, fa.comment, fa.occurred_at, fa.created_at
       FROM finance_adjustments fa
       JOIN memberships m ON m.id = fa.master_membership_id
       LEFT JOIN users u ON u.id = m.user_id
       WHERE ${where}
       ORDER BY fa.occurred_at DESC, fa.id DESC`,
      params
    );
    res.json(rows);
  })
);

router.post(
  '/',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { masterMembershipId, amount, comment, occurredAt } = req.body;
    if (!masterMembershipId || amount === undefined || amount === null || amount === '' || !comment || !comment.trim()) {
      return res.status(400).json({ error: 'Укажите мастера, сумму (+ премия или − вычет) и комментарий' });
    }
    const master = await pool.query(
      `SELECT id FROM memberships WHERE id = $1 AND company_id = $2 AND role = 'master'`,
      [masterMembershipId, req.tenant.companyId]
    );
    if (master.rows.length === 0) {
      return res.status(400).json({ error: 'Мастер не найден в этой компании' });
    }

    const { rows } = await pool.query(
      `INSERT INTO finance_adjustments (company_id, master_membership_id, amount, comment, occurred_at, created_by_user_id)
       VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), $6)
       RETURNING id, master_membership_id, amount, comment, occurred_at, created_at`,
      [req.tenant.companyId, masterMembershipId, amount, comment.trim(), occurredAt || null, req.user.id]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'finance',
      userId: req.user.id,
      entityType: 'finance_adjustment',
      entityId: rows[0].id,
      action: 'finance_adjustment.created',
    });

    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { amount, comment, occurredAt } = req.body;
    if (comment !== undefined && !comment.trim()) {
      return res.status(400).json({ error: 'Комментарий обязателен' });
    }
    const { rows } = await pool.query(
      `UPDATE finance_adjustments SET
         amount = COALESCE($1, amount),
         comment = COALESCE($2, comment),
         occurred_at = COALESCE($3, occurred_at)
       WHERE id = $4 AND company_id = $5
       RETURNING id, master_membership_id, amount, comment, occurred_at, created_at`,
      [amount === undefined || amount === null || amount === '' ? null : amount, comment?.trim() || null, occurredAt || null, req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Корректировка не найдена' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'finance',
      userId: req.user.id,
      entityType: 'finance_adjustment',
      entityId: rows[0].id,
      action: 'finance_adjustment.updated',
    });

    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM finance_adjustments WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Корректировка не найдена' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'finance',
      userId: req.user.id,
      entityType: 'finance_adjustment',
      entityId: Number(req.params.id),
      action: 'finance_adjustment.deleted',
    });

    res.status(204).end();
  })
);

module.exports = router;
