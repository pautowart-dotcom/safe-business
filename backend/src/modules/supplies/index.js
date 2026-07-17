const express = require('express');
const { registerModule } = require('../../core/modules-registry');
const { requireAuth } = require('../../core/middleware/auth');
const { requireTenant } = require('../../core/middleware/tenancy');
const { requireModule } = require('../../core/sdk');
const suppliesRoutes = require('./supplies.routes');

const BASE_PATH = '/api/modules/supplies';

const router = express.Router();
router.use(requireAuth, requireTenant, requireModule('supplies'), suppliesRoutes);

registerModule({
  key: 'supplies',
  name: 'Расходники',
  description: 'Склад расходных материалов: приход, списание, индикатор низкого остатка',
  icon: 'package',
  category: 'studio-os',
  backendBasePath: BASE_PATH,
  frontendEntry: 'supplies',
  router,
});

module.exports = router;
