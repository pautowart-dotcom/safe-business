const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { logEvent } = require('../core/eventLog');
const { EMPLOYMENT_TYPES, STEPS, listOnboarding, syncOnboardingDeadlines } = require('../modules/staff/onboarding');

// Оформление сотрудника (17.10.2026, Ф17) — шаги при найме в карточке
// сотрудника («Команда» → «Изменить»). Владелец и администратор: оформление
// новичков — обычная работа администратора, как и приглашение в команду.
const router = express.Router();
router.use(requireAuth, requireTenant, requireRole('owner', 'admin'));

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

async function findMember(companyId, membershipId) {
  const { rows } = await pool.query(
    `SELECT m.id, u.name, m.invited_email FROM memberships m LEFT JOIN users u ON u.id = m.user_id
     WHERE m.id = $1 AND m.company_id = $2 AND m.role != 'owner' AND m.active = true`,
    [membershipId, companyId]
  );
  return rows[0] || null;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listOnboarding(req.tenant.companyId));
  })
);

// Как оформлен, дата приёма, иностранец.
router.patch(
  '/:membershipId',
  asyncHandler(async (req, res) => {
    const { employmentType, hiredOn, isForeign } = req.body;
    if (employmentType !== undefined && employmentType !== null && !EMPLOYMENT_TYPES.includes(employmentType)) {
      return res.status(400).json({ error: 'Некорректный тип оформления' });
    }
    if (hiredOn !== undefined && hiredOn !== null && hiredOn !== '' && !isDate(hiredOn)) {
      return res.status(400).json({ error: 'Некорректная дата приёма' });
    }
    const member = await findMember(req.tenant.companyId, req.params.membershipId);
    if (!member) return res.status(404).json({ error: 'Сотрудник не найден' });

    await pool.query(
      `UPDATE memberships SET
         employment_type = CASE WHEN $1 THEN $2 ELSE employment_type END,
         hired_on = CASE WHEN $3 THEN $4::date ELSE hired_on END,
         is_foreign = COALESCE($5, is_foreign)
       WHERE id = $6 AND company_id = $7`,
      [
        'employmentType' in req.body,
        employmentType || null,
        'hiredOn' in req.body,
        hiredOn || null,
        typeof isForeign === 'boolean' ? isForeign : null,
        member.id,
        req.tenant.companyId,
      ]
    );
    await syncOnboardingDeadlines(req.tenant.companyId, member.id, member.name || member.invited_email || 'Сотрудник');
    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'membership',
      entityId: member.id,
      action: 'staff_onboarding.updated',
    });

    const [item] = await listOnboarding(req.tenant.companyId, { membershipId: member.id });
    res.json(item);
  })
);

// Отметить шаг сделанным или снять отметку.
router.put(
  '/:membershipId/steps/:stepKey',
  asyncHandler(async (req, res) => {
    const { stepKey } = req.params;
    const def = STEPS[stepKey];
    if (!def || def.auto) return res.status(400).json({ error: 'Этот шаг нельзя отметить вручную' });
    const member = await findMember(req.tenant.companyId, req.params.membershipId);
    if (!member) return res.status(404).json({ error: 'Сотрудник не найден' });

    if (req.body.done === false) {
      await pool.query('DELETE FROM staff_onboarding_steps WHERE membership_id = $1 AND step_key = $2', [member.id, stepKey]);
    } else {
      await pool.query(
        `INSERT INTO staff_onboarding_steps (membership_id, company_id, step_key, done_by_user_id)
         VALUES ($1, $2, $3, $4) ON CONFLICT (membership_id, step_key) DO NOTHING`,
        [member.id, req.tenant.companyId, stepKey, req.user.id]
      );
    }
    await syncOnboardingDeadlines(req.tenant.companyId, member.id, member.name || member.invited_email || 'Сотрудник');
    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'membership',
      entityId: member.id,
      action: req.body.done === false ? 'staff_onboarding.step_undone' : 'staff_onboarding.step_done',
    });

    const [item] = await listOnboarding(req.tenant.companyId, { membershipId: member.id });
    res.json(item);
  })
);

module.exports = router;
