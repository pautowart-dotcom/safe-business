const express = require('express');
const { registerModule } = require('../../core/modules-registry');
const { requireAuth } = require('../../core/middleware/auth');
const { requireTenant } = require('../../core/middleware/tenancy');
const { requireModule } = require('../../core/sdk');
const securityRoutes = require('./security.routes');
const reportRoutes = require('./report.routes');

const BASE_PATH = '/api/modules/security';

const router = express.Router();
router.use(requireAuth, requireTenant, requireModule('security'), securityRoutes);
router.use(requireAuth, requireTenant, requireModule('security'), reportRoutes);

registerModule({
  key: 'security',
  name: 'Безопасность',
  description: 'Аудит рисков бизнеса: бесплатный и расширенный тест, карта нарушений, дорожная карта устранения, обязательные документы',
  icon: 'shield',
  category: 'studio-os',
  backendBasePath: BASE_PATH,
  frontendEntry: 'security',
  router,
});

module.exports = router;
