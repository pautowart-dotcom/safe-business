const express = require('express');
const { registerModule } = require('../../core/modules-registry');
const { requireAuth } = require('../../core/middleware/auth');
const { requireTenant } = require('../../core/middleware/tenancy');
const { requireRole } = require('../../core/middleware/role');
const { requireModule } = require('../../core/sdk');
const { requireAddon } = require('../../core/middleware/addon');
const summaryRoutes = require('./summary.routes');
const recurringExpensesRoutes = require('./recurring-expenses.routes');
const expenseEntriesRoutes = require('./expense-entries.routes');
const adjustmentsRoutes = require('./adjustments.routes');
const revenueRoutes = require('./revenue.routes');
const shiftsRoutes = require('./shifts.routes');
const marginAdvisorRoutes = require('./margin-advisor.routes');

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
// ИИ-советник по марже (Этап 6 плана аналитики, docs/plan-2026-08-15-analytics-ai-monthly-summary.md)
// — owner-only (та же граница, что netProfit/materialsCost в /summary,
// маржа по услуге раскрывает себестоимость и % мастера). 18.08.2026 —
// добавлен биллинг-гейт: requireAddon пропускает "свои" студии владельца
// бесплатно (companies.free_addons, миграция 0088) и остальных — после
// разовой оплаты через /platform/addons/margin_advisor/checkout.
router.use('/margin-advisor', requireRole('owner'), requireAddon('margin_advisor'), marginAdvisorRoutes);

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
