const express = require('express');
const { registerModule } = require('../../core/modules-registry');
const { requireAuth } = require('../../core/middleware/auth');
const { requireTenant } = require('../../core/middleware/tenancy');
const { requireRole } = require('../../core/middleware/role');
const { requireModule } = require('../../core/sdk');
const summaryRoutes = require('./summary.routes');
const recurringExpensesRoutes = require('./recurring-expenses.routes');
const expenseEntriesRoutes = require('./expense-entries.routes');

const BASE_PATH = '/api/modules/finance';

// Финансы — только владелец (README: "нет доступа" для мастера), поэтому
// requireRole('owner') висит на всём роутере модуля, а не на части эндпоинтов.
const router = express.Router();
router.use(requireAuth, requireTenant, requireModule('finance'), requireRole('owner'));
router.use('/summary', summaryRoutes);
router.use('/recurring-expenses', recurringExpensesRoutes);
router.use('/expenses', expenseEntriesRoutes);

registerModule({
  key: 'finance',
  name: 'Финансы',
  description: 'Выручка, авторасчёт зарплат мастеров, расходы и чистая прибыль',
  icon: 'wallet',
  category: 'studio-os',
  backendBasePath: BASE_PATH,
  frontendEntry: 'finance',
  router,
});

module.exports = router;
