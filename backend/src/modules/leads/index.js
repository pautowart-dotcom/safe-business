const express = require('express');
const { registerModule } = require('../../core/modules-registry');
const { requireAuth } = require('../../core/middleware/auth');
const { requireTenant } = require('../../core/middleware/tenancy');
const { requireModule } = require('../../core/sdk');
const leadsRoutes = require('./leads.routes');

const BASE_PATH = '/api/modules/leads';

// Модуль "Заявки" (20.08.2026) — первый повод: клининг, владелица сама
// разбирает входящие заявки без менеджера продаж, физ/юр в одном потоке.
// Отдельный от "Клиенты"/"Визиты" переключаемый флаг (toggleable) — не
// каждой нише это нужно (у маникюра, например, обычно запись, а не заявка).
const router = express.Router();
router.use(requireAuth, requireTenant, requireModule('leads'), leadsRoutes);

registerModule({
  key: 'leads',
  name: 'Заявки',
  description: 'Учёт входящих заявок: новый лид → связались → заказ → оплачено',
  icon: 'inbox',
  category: 'studio-os',
  backendBasePath: BASE_PATH,
  frontendEntry: 'leads',
  router,
  toggleable: true,
});

module.exports = router;
