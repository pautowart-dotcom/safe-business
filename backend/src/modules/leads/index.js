const express = require('express');
const { registerModule } = require('../../core/modules-registry');
const { requireAuth } = require('../../core/middleware/auth');
const { requireTenant } = require('../../core/middleware/tenancy');
const { requireRole } = require('../../core/middleware/role');
const { requireModule } = require('../../core/sdk');
const leadsRoutes = require('./leads.routes');

const BASE_PATH = '/api/modules/leads';

// Модуль "Заявки" (20.08.2026) — первый повод: клининг, владелица сама
// разбирает входящие заявки без менеджера продаж, физ/юр в одном потоке.
// Отдельный от "Клиенты"/"Визиты" переключаемый флаг (toggleable) — не
// каждой нише это нужно (у маникюра, например, обычно запись, а не заявка).
//
// requireRole('owner', 'admin') добавлен 21.08.2026 — раньше здесь не было
// проверки роли вообще, и role='master' (рядовой исполнитель, например
// уборщица) видел телефоны и имена ВСЕХ заявок компании. Реальная утечка
// персональных данных линейным сотрудникам, не формальность — та же
// граница, что во всех настоящих CRM для клининга (менеджер/офис видит
// контакты клиентов, полевой исполнитель — нет).
const router = express.Router();
router.use(requireAuth, requireTenant, requireModule('leads'), requireRole('owner', 'admin'), leadsRoutes);

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
