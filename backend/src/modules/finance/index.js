const express = require('express');
const { registerModule } = require('../../core/modules-registry');
const { requireAuth } = require('../../core/middleware/auth');
const { requireTenant } = require('../../core/middleware/tenancy');
const { requireRole } = require('../../core/middleware/role');
const { requireModule } = require('../../core/sdk');
const summaryRoutes = require('./summary.routes');
const recurringExpensesRoutes = require('./recurring-expenses.routes');
const expenseEntriesRoutes = require('./expense-entries.routes');
const adjustmentsRoutes = require('./adjustments.routes');

const BASE_PATH = '/api/modules/finance';

// Сводка по компании и управление расходами — владелец и администратор
// (netProfit при этом скрывается для admin внутри summary.routes.js).
// Корректировки (adjustments) доступны и мастеру (видит свои, редактировать
// не может — роль проверяется внутри adjustments.routes.js по каждому
// эндпоинту), так как у мастера теперь есть собственный экран "Финансы"
// (Этап 6).
const router = express.Router();
router.use(requireAuth, requireTenant, requireModule('finance'));
router.use('/summary', requireRole('owner', 'admin'), summaryRoutes);
router.use('/recurring-expenses', requireRole('owner', 'admin'), recurringExpensesRoutes);
router.use('/expenses', requireRole('owner', 'admin'), expenseEntriesRoutes);
router.use('/adjustments', adjustmentsRoutes);

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
