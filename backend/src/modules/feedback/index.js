const express = require('express');
const { registerModule } = require('../../core/modules-registry');
const { requireAuth } = require('../../core/middleware/auth');
const { requireTenant } = require('../../core/middleware/tenancy');
const { requireModule } = require('../../core/sdk');
const feedbackRoutes = require('./feedback.routes');

const BASE_PATH = '/api/modules/feedback';

const router = express.Router();
router.use(requireAuth, requireTenant, requireModule('feedback'), feedbackRoutes);

registerModule({
  key: 'feedback',
  name: 'Обратная связь',
  description: 'Сообщения от мастеров владельцу',
  icon: 'msg',
  category: 'studio-os',
  backendBasePath: BASE_PATH,
  frontendEntry: 'feedback',
  router,
});

module.exports = router;
