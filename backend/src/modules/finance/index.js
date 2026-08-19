const express = require('express');
const { registerModule } = require('../../core/modules-registry');
const { requireAuth } = require('../../core/middleware/auth');
const { requireTenant } = require('../../core/middleware/tenancy');
const { requireRole } = require('../../core/middleware/role');
const { requireModule } = require('../../core/sdk');
const { requireAiAdvisorSubscription } = require('../../core/middleware/subscription');
const summaryRoutes = require('./summary.routes');
const recurringExpensesRoutes = require('./recurring-expenses.routes');
const expenseEntriesRoutes = require('./expense-entries.routes');
const adjustmentsRoutes = require('./adjustments.routes');
const revenueRoutes = require('./revenue.routes');
const shiftsRoutes = require('./shifts.routes');
const marginAdvisorRoutes = require('./margin-advisor.routes');
const discountAdvisorRoutes = require('./discount-advisor.routes');
const masterDepartureAdvisorRoutes = require('./master-departure-advisor.routes');
const aiAdvisorDigestRoutes = require('./ai-advisor-digest.routes');

const BASE_PATH = '/api/modules/finance';

// Сводка по компании и управление расходами — владелец и администратор
// (netProfit при этом скрывается для admin внутри summary.routes.js).
// Задача 3 (07.08.2026) давала мастеру доступ на просмотр общей сводки
// компании — 15.08.2026 владелец явно пересмотрел это решение: у мастера
// (сотрудника) в его "Финансах" должны быть только его собственные данные,
// не цифры компании целиком. /summary снова owner/admin-only; собственные
// визиты/комиссию/корректировки мастер по-прежнему видит через
// /modules/visits и /modules/finance/adjustments — они уже скопированы
// на свои записи (role === 'master' фильтр внутри каждого роута).
const router = express.Router();
router.use(requireAuth, requireTenant, requireModule('finance'));
router.use('/summary', requireRole('owner', 'admin'), summaryRoutes);
router.use('/recurring-expenses', requireRole('owner', 'admin'), recurringExpensesRoutes);
router.use('/expenses', requireRole('owner', 'admin'), expenseEntriesRoutes);
router.use('/adjustments', adjustmentsRoutes);
// Записи о выручке (Пакет 3, Этап 1.2) — источник auto_from_visit/manual.
router.use('/revenue', requireRole('owner', 'admin'), revenueRoutes);
// Смены для оплаты "за выход" (15.08.2026) — роль проверяется внутри
// shifts.routes.js по каждому эндпоинту (мастер видит свои, создаёт/
// правит только owner/admin — та же граница, что у adjustments).
router.use('/shifts', shiftsRoutes);
// ИИ-советники ("ИИ-управляющий" — маржа/скидки/уход мастера, см.
// docs/business-ideas-backlog.md) — owner-only (та же граница, что
// netProfit/materialsCost в /summary). 19.08.2026: настоящая ежемесячная
// допподписка построена (миграция 0090, backend/src/platform/
// ai-advisor-subscription.routes.js) — requireAiAdvisorSubscription
// проверяет её собственный статус, независимо от статуса базовой подписки
// платформы. companies.free_addons = true (переключатель в админке, PATCH
// /platform/admin/companies/:id/free-addons) по-прежнему пропускает
// советников бесплатно — та же лазейка, что и раньше, для обкатки на своих
// студиях.
router.use('/margin-advisor', requireRole('owner'), requireAiAdvisorSubscription, marginAdvisorRoutes);
router.use('/discount-advisor', requireRole('owner'), requireAiAdvisorSubscription, discountAdvisorRoutes);
router.use('/master-departure-advisor', requireRole('owner'), requireAiAdvisorSubscription, masterDepartureAdvisorRoutes);
router.use('/ai-advisor-digest', requireRole('owner'), requireAiAdvisorSubscription, aiAdvisorDigestRoutes);

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
