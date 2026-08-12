const express = require('express');
const { registerModule } = require('../../core/modules-registry');
const { requireAuth } = require('../../core/middleware/auth');
const { requireTenant } = require('../../core/middleware/tenancy');
const { requireModule } = require('../../core/sdk');
const documentTemplatesRoutes = require('./document-templates.routes');

const BASE_PATH = '/api/modules/document-templates';

const router = express.Router();
router.use(requireAuth, requireTenant, requireModule('document-templates'), documentTemplatesRoutes);

registerModule({
  key: 'document-templates',
  name: 'Шаблоны документов',
  description: 'Генерация документов из проверенных шаблонов, заполненных данными бизнеса',
  icon: 'file-text',
  category: 'studio-os',
  backendBasePath: BASE_PATH,
  frontendEntry: 'document-templates',
  router,
});

module.exports = router;
