// ИИ-управляющий в кабинете платформы (21.08.2026) — "чтение и анализ",
// владелец явно попросил не действия, поэтому этот роут сильно проще
// клиентского modules/ai-assistant/ai-assistant.routes.js: все инструменты
// в adminAiTools.js readOnly, нет /confirm вообще, нет ветки
// pending_action — выполняется и отвечает текстом за один обмен.
// История не сохраняется в БД (в отличие от клиентского ассистента) —
// владелец здесь один человек, не команда, состояние держит сама страница
// (AiManager.jsx); можно добавить персистентность позже, если понадобится
// возвращаться к диалогу после перезагрузки.
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireSuperAdmin } = require('../core/middleware/role');
const yandexAgent = require('../core/yandexAgent');
const { listToolDefinitions, getTool } = require('./adminAiTools');
const { SYSTEM_PROMPT } = require('./adminAiSystemPrompt');

const router = express.Router();
router.use(requireAuth, requireSuperAdmin);

// Тот же лимит, что и у клиентского ассистента (MAX_HISTORY_MESSAGES=8,
// ai-assistant.routes.js) — тот же вывод из сегодняшней оптимизации
// экономики ассистента: длинная история — основной источник накладных
// токенов, не сам вопрос.
const MAX_HISTORY_MESSAGES = 8;

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && typeof m.role === 'string' && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));
}

router.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Пустое сообщение' });
    }
    if (!yandexAgent.isAiConfigured()) {
      return res.status(503).json({ error: 'ИИ пока не настроен на сервере (нужны YANDEX_AI_STUDIO_API_KEY и YANDEX_FOLDER_ID)' });
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...sanitizeHistory(req.body.history),
      { role: 'user', content: message },
    ];

    let result;
    try {
      result = await yandexAgent.chat({ messages, tools: listToolDefinitions() });
    } catch (err) {
      return res.status(502).json({ error: 'Не удалось получить ответ от ИИ: ' + err.message });
    }

    if (result.type === 'text') {
      return res.json({ text: result.text });
    }

    // Все инструменты в adminAiTools.js readOnly — выполняем сразу, без
    // ветки pending_action/confirm, которая есть у клиентского ассистента.
    const call = result.toolCalls[0];
    const tool = call && getTool(call.name);
    if (!tool) {
      return res.json({ text: 'Пока не умею отвечать на такой вопрос — уточните, пожалуйста, или спросите про общую картину по платформе.' });
    }
    if (call.arguments === null) {
      return res.json({ text: 'Не удалось разобрать параметры запроса, повторите вопрос, пожалуйста.' });
    }
    try {
      const text = await tool.execute(call.arguments);
      return res.json({ text });
    } catch (err) {
      return res.status(502).json({ error: 'Не удалось получить данные: ' + err.message });
    }
  })
);

module.exports = router;
