const express = require('express');
const { registerModule } = require('../../core/modules-registry');
const { requireAuth } = require('../../core/middleware/auth');
const { requireTenant } = require('../../core/middleware/tenancy');
const { requireModule } = require('../../core/sdk');
const checklistsRoutes = require('./checklists.routes');

const BASE_PATH = '/api/modules/checklists';

const router = express.Router();
router.use(requireAuth, requireTenant, requireModule('checklists'), checklistsRoutes);

registerModule({
  key: 'checklists',
  name: 'Чек-листы',
  description: 'Шаблоны чек-листов смены и отметки выполнения мастерами',
  icon: 'check-square',
  category: 'studio-os',
  backendBasePath: BASE_PATH,
  frontendEntry: 'checklists',
  router,
});

module.exports = router;
