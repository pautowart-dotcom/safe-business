const express = require('express');
const { registerModule } = require('../../core/modules-registry');
const { requireAuth } = require('../../core/middleware/auth');
const { requireTenant } = require('../../core/middleware/tenancy');
const { requireModule } = require('../../core/sdk');
const visitsRoutes = require('./visits.routes');

const BASE_PATH = '/api/modules/visits';

const router = express.Router();
router.use(requireAuth, requireTenant, requireModule('visits'), visitsRoutes);

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
