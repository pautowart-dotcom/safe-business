const express = require('express');
const { registerModule } = require('../../core/modules-registry');
const { requireAuth } = require('../../core/middleware/auth');
const { requireTenant } = require('../../core/middleware/tenancy');
const { requireModule } = require('../../core/sdk');
const visitsRoutes = require('./visits.routes');
const servicesRoutes = require('../services/services.routes');

const BASE_PATH = '/api/modules/visits';

const router = express.Router();
router.use(requireAuth, requireTenant, requireModule('visits'));
// Каталог услуг (Этап 2 плана аналитики, 15.08.2026) — часть модуля
// "Визиты", не отдельный переключаемый модуль: без визитов у каталога нет
// самостоятельного смысла. Монтируется ДО visitsRoutes — иначе запрос на
// /services попал бы в GET /:id визита (id="services") раньше, чем сюда.
router.use('/services', servicesRoutes);
router.use(visitsRoutes);

registerModule({
  key: 'visits',
  name: 'Визиты',
  description: 'Учёт визитов: услуга, сумма, скидка, фото до/после, заработок мастера',
  icon: 'calendar',
  category: 'studio-os',
  backendBasePath: BASE_PATH,
  frontendEntry: 'visits',
  router,
  // Пакет 3, Этап 1.1: единственный опциональный модуль — выключен по
  // умолчанию для новых компаний, включён явно миграцией для существующих.
  toggleable: true,
});

module.exports = router;
