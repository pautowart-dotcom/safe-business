// Проверка месяца (17.10.2026, этап 7) — modules/monthly/monthlyCheck.js.
// Владелец и администратор: администратор и так закрывает сроки и задачи.
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { logEvent } = require('../core/eventLog');
const { getState, complete } = require('../modules/monthly/monthlyCheck');

const router = express.Router();
router.use(requireAuth, requireTenant, requireRole('owner', 'admin'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await getState(req.tenant.companyId, { role: req.tenant.role }));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const result = await complete({
      companyId: req.tenant.companyId,
      membershipId: req.tenant.membershipId,
      userId: req.user.id,
      answers: req.body?.answers,
      role: req.tenant.role,
    });
    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'monthly_check',
      action: 'monthly_check.completed',
    });
    res.json(result);
  })
);

module.exports = router;
