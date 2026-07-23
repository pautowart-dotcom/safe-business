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
const revenueRoutes = require('./revenue.routes');

const BASE_PATH = '/api/modules/finance';

// Сводка по компании и управление расходами — владелец и администратор
// (netProfit при этом скрывается для admin и master внутри summary.routes.js).
// Задача 3 (сверка ролей): мастер получил доступ на просмотр общей сводки
// компании (не только своих визитов) — раньше не имел вовсе, решение
// владельца было "просмотр + свои корректировки". Мутирующие подресурсы
// (recurring-expenses/expenses/revenue) остаются owner/admin — мастеру
// только смотреть, не редактировать.
// Корректировки (adjustments) доступны и мастеру (видит свои, редактировать
// не может — роль проверяется внутри adjustments.routes.js по каждому
// эндпоинту), так как у мастера теперь есть собственный экран "Финансы"
// (Этап 6).
const router = express.Router();
router.use(requireAuth, requireTenant, requireModule('finance'));
router.use('/summary', requireRole('owner', 'admin', 'master'), summaryRoutes);
router.use('/recurring-expenses', requireRole('owner', 'admin'), recurringExpensesRoutes);
router.use('/expenses', requireRole('owner', 'admin'), expenseEntriesRoutes);
router.use('/adjustments', adjustmentsRoutes);
// Записи о выручке (Пакет 3, Этап 1.2) — источник auto_from_visit/manual.
router.use('/revenue', requireRole('owner', 'admin'), revenueRoutes);

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
