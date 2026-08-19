const express = require('express');
const { registerModule } = require('../../core/modules-registry');
const { requireAuth } = require('../../core/middleware/auth');
const { requireTenant } = require('../../core/middleware/tenancy');
const { requireRole } = require('../../core/middleware/role');
const { requireModule } = require('../../core/sdk');
const { requirePaidPlanOrFreeAddons } = require('../../core/middleware/subscription');
const aiAssistantRoutes = require('./ai-assistant.routes');

const BASE_PATH = '/api/modules/ai-assistant';

// Первый узкий срез ИИ-ассистента (задача 19.08.2026) — чат с function
// calling, сейчас с одним инструментом (create_expense), архитектура
// рассчитана на добавление следующих без переделки (см.
// tools/registry.js). Owner-only — тот же гейт, что у остальных
// ИИ-советников семьи /ai-advisor (finance/index.js): requirePaidPlanOrFreeAddons
// закрывает доступ в бесплатный пробный месяц, чтобы нельзя было получить
// пользу от ИИ и уйти без оплаты, companies.free_addons даёт ручную
// бесплатную лазейку тем же способом, что и там.
//
// category: 'studio-os', toggleable не указан (= false) — модуль попадает в
// studioOsBundleKeys() и включается автоматически ТОЛЬКО для НОВЫХ
// компаний при регистрации (auth.routes.js/companies.routes.js). Для уже
// существующих компаний нужен один разовый backfill — тот же паттерн, что
// был у document-templates (см. scripts/enableAiAssistantModule.js и
// комментарий в нём про то, почему это не мигрция, а отдельный скрипт).
const router = express.Router();
router.use(requireAuth, requireTenant, requireModule('ai-assistant'), requireRole('owner'), requirePaidPlanOrFreeAddons, aiAssistantRoutes);

registerModule({
  key: 'ai-assistant',
  name: 'ИИ-ассистент',
  description: 'Чат с ИИ, который по запросу выполняет действия в системе и отвечает на вопросы о бизнесе (сейчас — расход/доход, выручка за период, открытые нарушения безопасности)',
  icon: 'msg',
  category: 'studio-os',
  backendBasePath: BASE_PATH,
  frontendEntry: 'ai-assistant',
  router,
});

module.exports = router;
