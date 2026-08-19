const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const yandexAgent = require('../../core/yandexAgent');
const { listToolDefinitions, getTool } = require('./tools/registry');
const { SYSTEM_PROMPT } = require('./systemPrompt');

const router = express.Router();

// Хвост истории диалога, который фронт присылает для контекста — фронт сам
// хранит всю историю в состоянии страницы (см. задачу: "история — простой
// массив последних сообщений, не нужно хранить в БД в этом заходе"), здесь
// только защита от случайно присланного огромного массива.
const MAX_HISTORY_MESSAGES = 12;

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && typeof m.role === 'string' && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));
}

// POST /chat — НИКОГДА не пишет в БД. Три возможных ответа фронту:
//   { type: 'text', text }              — модель ответила обычным текстом.
//   { type: 'clarification', text }     — модели не хватило данных, или она
//                                          предложила действие с невалидными
//                                          параметрами (например категория
//                                          не из списка) — переспрашиваем,
//                                          а не пытаемся угадать/исправить.
//   { type: 'pending_action', tool, params, confirmationText } — параметры
//                                          валидны, но запись ЕЩЁ НЕ
//                                          создана, ждём подтверждения
//                                          пользователя через /confirm.
router.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Пустое сообщение' });
    }
    if (!yandexAgent.isAiConfigured()) {
      return res.status(503).json({ error: 'ИИ-ассистент пока не настроен на сервере (нужны YANDEX_GPT_API_KEY и YANDEX_FOLDER_ID)' });
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
      return res.json({ type: 'text', text: result.text });
    }

    // tool_calls — в этом узком срезе в реестре ровно один инструмент,
    // поэтому берём первый вызов; поддержка нескольких инструментов за один
    // ответ модели появится вместе со вторым инструментом в реестре, здесь
    // сознательно не усложняем заранее.
    const call = result.toolCalls[0];
    const tool = call && getTool(call.name);
    if (!tool) {
      return res.json({
        type: 'clarification',
        text: 'Пока не умею выполнять такое действие. Сейчас доступно только "внести расход" — уточните, пожалуйста, что нужно сделать.',
      });
    }
    if (call.arguments === null) {
      return res.json({
        type: 'clarification',
        text: 'Не удалось разобрать параметры действия. Повторите, пожалуйста, какую сумму, категорию и дату внести.',
      });
    }

    const { valid, errors } = tool.validate(call.arguments);
    if (!valid) {
      return res.json({ type: 'clarification', text: errors.join(' ') });
    }

    return res.json({
      type: 'pending_action',
      tool: tool.name,
      params: call.arguments,
      confirmationText: tool.buildConfirmation(call.arguments),
    });
  })
);

// POST /confirm — единственное место во всём модуле, которое реально пишет
// в БД. Параметры валидируются заново (не доверяем тому, что фронт мог
// передать то же самое, что показывал на карточке подтверждения — прямой
// вызов этого эндпоинта в обход /chat технически возможен).
router.post(
  '/confirm',
  asyncHandler(async (req, res) => {
    const { tool: toolName, params } = req.body;
    const tool = getTool(toolName);
    if (!tool) {
      return res.status(400).json({ error: 'Неизвестное действие' });
    }

    const { valid, errors } = tool.validate(params || {});
    if (!valid) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const record = await tool.execute(params, req);
    res.status(201).json({ tool: tool.name, record });
  })
);

module.exports = router;
