const express = require('express');
const { registerModule } = require('../../core/modules-registry');
const { requireAuth } = require('../../core/middleware/auth');
const { requireTenant } = require('../../core/middleware/tenancy');
const { requireModule } = require('../../core/sdk');
const clientsRoutes = require('./clients.routes');

const BASE_PATH = '/api/modules/clients';

const router = express.Router();
router.use(requireAuth, requireTenant, requireModule('clients'), clientsRoutes);

registerModule({
  key: 'clients',
  name: 'Клиенты',
  description: 'База клиентов компании: поиск по фамилии, контакты, история обращений',
  icon: 'users',
  category: 'studio-os',
  backendBasePath: BASE_PATH,
  frontendEntry: 'clients',
  router,
  // См. комментарий в modules/visits/index.js — Визиты и Клиенты образуют
  // один переключаемый флаг "visits_clients" из docs/task-batch-3.txt.
  toggleable: true,
});

module.exports = router;
