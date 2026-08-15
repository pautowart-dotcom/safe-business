const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../core/middleware/role');
const emptyToNull = require('../../utils/emptyToNull');
const { logEvent } = require('../../core/eventLog');

const router = express.Router();

// Учёт смен для оплаты "за выход" (15.08.2026) — отдельная явная сущность,
// не переиспользует чек-лист открытия смены (санитарный процесс, не про
// деньги). Ведёт только owner/admin — тот же уровень чувствительности,
// что и у finance_adjustments (премии/вычеты): мастер видит свои смены,
// не создаёт и не редактирует их сам, чтобы самоотчёт не управлял напрямую
// его же зарплатой без подтверждения владельца/администратора.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const params = [req.tenant.companyId];
    let where = 'ms.company_id = $1';

    if (req.tenant.role === 'master') {
      params.push(req.tenant.membershipId);
      where += ` AND ms.master_membership_id = $${params.length}`;
    } else if (req.query.masterMembershipId) {
      params.push(req.query.masterMembershipId);
      where += ` AND ms.master_membership_id = $${params.length}`;
    }

    if (req.query.dateFrom) {
      params.push(req.query.dateFrom);
      where += ` AND ms.shift_date >= $${params.length}`;
    }
    if (req.query.dateTo) {
      params.push(req.query.dateTo);
      where += ` AND ms.shift_date <= $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT ms.id, ms.master_membership_id, u.name AS master_name, ms.shift_date, ms.payout_amount, ms.created_at
       FROM master_shifts ms
       JOIN memberships m ON m.id = ms.master_membership_id
       LEFT JOIN users u ON u.id = m.user_id
       WHERE ${where}
       ORDER BY ms.shift_date DESC, ms.id DESC`,
      params
    );
    res.json(rows);
  })
);

router.post(
  '/',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { masterMembershipId, shiftDate, payoutAmount } = req.body;
    if (!masterMembershipId || !shiftDate) {
      return res.status(400).json({ error: 'Укажите мастера и дату смены' });
    }
    const master = await pool.query(
      `SELECT id, shift_payout_amount FROM memberships WHERE id = $1 AND company_id = $2 AND role = 'master'`,
      [masterMembershipId, req.tenant.companyId]
    );
    if (master.rows.length === 0) {
      return res.status(400).json({ error: 'Мастер не найден в этой компании' });
    }
    // Если сумма не передана явно — берём ставку мастера за смену. Если и
    // её нет — нечем заполнить сумму, отдельная явная ошибка вместо тихого
    // NULL/0 (0 выглядело бы как "смена оплачена нулём", а не "ставка не
    // задана").
    const resolvedAmount = payoutAmount !== undefined && payoutAmount !== null && payoutAmount !== ''
      ? Number(payoutAmount)
      : master.rows[0].shift_payout_amount;
    if (resolvedAmount === null || resolvedAmount === undefined) {
      return res.status(400).json({ error: 'Для этого мастера не задана ставка за смену — укажите сумму вручную или задайте ставку в разделе «Команда»' });
    }

    let rows;
    try {
      ({ rows } = await pool.query(
        `INSERT INTO master_shifts (company_id, master_membership_id, shift_date, payout_amount, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, master_membership_id, shift_date, payout_amount, created_at`,
        [req.tenant.companyId, masterMembershipId, shiftDate, resolvedAmount, req.user.id]
      ));
    } catch (err) {
      if (err.code === '23505') {
        return res.status(400).json({ error: 'Смена на эту дату для этого мастера уже отмечена' });
      }
      throw err;
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'finance',
      userId: req.user.id,
      entityType: 'master_shift',
      entityId: rows[0].id,
      action: 'master_shift.created',
    });

    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { shiftDate, payoutAmount } = req.body;
    const { rows } = await pool.query(
      `UPDATE master_shifts SET
         shift_date = COALESCE($1, shift_date),
         payout_amount = COALESCE($2, payout_amount)
       WHERE id = $3 AND company_id = $4
       RETURNING id, master_membership_id, shift_date, payout_amount, created_at`,
      [shiftDate || null, emptyToNull(payoutAmount), req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Смена не найдена' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'finance',
      userId: req.user.id,
      entityType: 'master_shift',
      entityId: rows[0].id,
      action: 'master_shift.updated',
    });

    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM master_shifts WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Смена не найдена' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'finance',
      userId: req.user.id,
      entityType: 'master_shift',
      entityId: Number(req.params.id),
      action: 'master_shift.deleted',
    });

    res.status(204).end();
  })
);

module.exports = router;
