const express = require('express');
const { registerModule } = require('../../core/modules-registry');
const { requireAuth } = require('../../core/middleware/auth');
const { requireTenant } = require('../../core/middleware/tenancy');
const { requireModule } = require('../../core/sdk');
const knowledgeRoutes = require('./knowledge.routes');

const BASE_PATH = '/api/modules/knowledge';

const router = express.Router();
router.use(requireAuth, requireTenant, requireModule('knowledge'), knowledgeRoutes);

registerModule({
  key: 'knowledge',
  name: 'База знаний',
  description: 'Разделы и статьи компании: создаёт владелец, читают все',
  icon: 'book-open',
  category: 'studio-os',
  backendBasePath: BASE_PATH,
  frontendEntry: 'knowledge',
  router,
});

module.exports = router;
