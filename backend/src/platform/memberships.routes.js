const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { logEvent } = require('../core/eventLog');

const router = express.Router();

router.use(requireAuth, requireTenant);

router.get(
  '/',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT m.id, m.role, m.branch_id, m.payout_percent, m.invite_status, m.invited_email, m.created_at,
              u.id AS user_id, u.name AS user_name, u.email AS user_email
       FROM memberships m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.company_id = $1
       ORDER BY m.created_at`,
      [req.tenant.companyId]
    );
    console.log('[invite-debug] GET /memberships rows =', JSON.stringify(rows.map((r) => ({ id: r.id, role: r.role, invite_status: r.invite_status, invited_email: r.invited_email }))));
    res.json(rows);
  })
);

router.post(
  '/invite',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { role, branchId, payoutPercent, invitedEmail } = req.body;
    // Временная диагностика бага "роль приглашения сохраняется как owner"
    // (docs/otvet-bag-rol.txt) — не удалось воспроизвести чтением кода,
    // логируем факты вместо догадок. Убрать после подтверждения причины.
    console.log('[invite-debug] req.body =', JSON.stringify(req.body));
    if (!role || !['owner', 'master'].includes(role)) {
      return res.status(400).json({ error: 'Укажите корректную роль (owner или master)' });
    }

    const inviteToken = crypto.randomBytes(24).toString('hex');
    const { rows } = await pool.query(
      `INSERT INTO memberships (company_id, role, branch_id, payout_percent, invited_email, invite_token, invite_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id, role, branch_id, invite_token, created_at`,
      [req.tenant.companyId, role, branchId || null, payoutPercent || null, invitedEmail || null, inviteToken]
    );
    console.log('[invite-debug] inserted row =', JSON.stringify(rows[0]));

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'membership',
      entityId: rows[0].id,
      action: 'membership.invited',
    });

    res.status(201).json({
      membershipId: rows[0].id,
      role: rows[0].role,
      inviteToken,
      inviteUrl: `${process.env.FRONTEND_URL || ''}/invite/${inviteToken}`,
    });
  })
);

// Изменение мастера владельцем: % выплаты и/или филиал.
// Роль сознательно не меняется этим эндпоинтом — понижение/повышение owner<->master
// не входит в задачи управления командой и требует отдельного продуманного флоу.
router.patch(
  '/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { payoutPercent, branchId } = req.body;

    if (branchId) {
      const branch = await pool.query('SELECT 1 FROM branches WHERE id = $1 AND company_id = $2', [
        branchId,
        req.tenant.companyId,
      ]);
      if (branch.rows.length === 0) {
        return res.status(400).json({ error: 'Филиал не найден в этой компании' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE memberships SET
         payout_percent = COALESCE($1, payout_percent),
         branch_id = COALESCE($2, branch_id)
       WHERE id = $3 AND company_id = $4 AND role = 'master'
       RETURNING id, role, branch_id, payout_percent, invite_status`,
      [payoutPercent ?? null, branchId ?? null, req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Участник не найден' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'membership',
      entityId: rows[0].id,
      action: 'membership.updated',
    });

    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      `DELETE FROM memberships WHERE id = $1 AND company_id = $2 AND role = 'master'`,
      [req.params.id, req.tenant.companyId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Участник не найден' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'membership',
      entityId: Number(req.params.id),
      action: 'membership.removed',
    });

    res.status(204).end();
  })
);

module.exports = router;
