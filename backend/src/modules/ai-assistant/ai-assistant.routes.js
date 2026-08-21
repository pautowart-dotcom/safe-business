const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { encrypt, decrypt } = require('../../core/crypto');
const yandexAgent = require('../../core/yandexAgent');
const { listToolDefinitions, getTool } = require('./tools/registry');
const { SYSTEM_PROMPT } = require('./systemPrompt');

const router = express.Router();

// История чата (19.08.2026, миграция 0094) — владелец явно попросил, раньше
// пропадала при обновлении страницы. Последние 50 сообщений достаточно для
// контекста человеку (не модели — контекст модели по-прежнему собирается из
// того, что фронт прислал в history, не отсюда).
const MESSAGE_HISTORY_LIMIT = 50;

async function saveMessage(companyId, role, content) {
  await pool.query(
    `INSERT INTO ai_assistant_messages (company_id, role, content_enc) VALUES ($1, $2, $3)`,
    [companyId, role, encrypt(content)]
  );
}

router.get(
  '/messages',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT role, content_enc, created_at FROM ai_assistant_messages
       WHERE company_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.tenant.companyId, MESSAGE_HISTORY_LIMIT]
    );
    res.json(rows.reverse().map((r) => ({ role: r.role, content: decrypt(r.content_enc), createdAt: r.created_at })));
  })
);

// "Новый диалог" (20.08.2026) — обнаружили, что старый ответ модели в
// истории ("умею только 4 периода") продолжал перевешивать НОВУЮ
// возможность (daysAgo) в том же диалоге — модель охотнее соглашается со
// своей же более ранней репликой, чем с описанием инструмента. Раз история
// теперь постоянная (по просьбе владельца), нужен явный способ начать с
// чистого листа, когда контекст успел устареть/сбить модель с толку.
router.delete(
  '/messages',
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM ai_assistant_messages WHERE company_id = $1', [req.tenant.companyId]);
    res.status(204).end();
  })
);

// Хвост истории диалога, который фронт присылает для контекста — фронт сам
// хранит всю историю в состоянии страницы (см. задачу: "история — простой
// массив последних сообщений, не нужно хранить в БД в этом заходе"), здесь
// только защита от случайно присланного огромного массива.
const MAX_HISTORY_MESSAGES = 8;

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
      return res.status(503).json({ error: 'ИИ-ассистент пока не настроен на сервере (нужны YANDEX_AI_STUDIO_API_KEY и YANDEX_FOLDER_ID)' });
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...sanitizeHistory(req.body.history),
      { role: 'user', content: message },
    ];

    // Сообщение пользователя сохраняем сразу, независимо от того, что
    // ответит ИИ дальше — это реально было отправлено (тот же принцип, что
    // и у истории на фронте, см. AiAssistant.jsx: "откатывать не нужно").
    await saveMessage(req.tenant.companyId, 'user', message);

    let result;
    try {
      result = await yandexAgent.chat({ messages, tools: listToolDefinitions() });
    } catch (err) {
      return res.status(502).json({ error: 'Не удалось получить ответ от ИИ: ' + err.message });
    }

    if (result.type === 'text') {
      await saveMessage(req.tenant.companyId, 'assistant', result.text);
      return res.json({ type: 'text', text: result.text });
    }

    // tool_calls — в этом узком срезе в реестре ровно один инструмент,
    // поэтому берём первый вызов; поддержка нескольких инструментов за один
    // ответ модели появится вместе со вторым инструментом в реестре, здесь
    // сознательно не усложняем заранее.
    const call = result.toolCalls[0];
    const tool = call && getTool(call.name);
    if (!tool) {
      const text = 'Пока не умею выполнять такое действие — уточните, пожалуйста, что нужно сделать, или спросите, что я умею.';
      await saveMessage(req.tenant.companyId, 'assistant', text);
      return res.json({ type: 'clarification', text });
    }

    // Читающие инструменты (readOnly: true) выполняются сразу здесь, без
    // подтверждения — ничего не меняется, значит и спрашивать "точно?" не
    // нужно (см. комментарий в tools/registry.js про два вида инструментов).
    if (tool.readOnly) {
      let text;
      try {
        text = await tool.execute(call.arguments || {}, req);
      } catch (err) {
        return res.status(502).json({ error: 'Не удалось получить данные: ' + err.message });
      }
      await saveMessage(req.tenant.companyId, 'assistant', text);
      return res.json({ type: 'text', text });
    }

    if (call.arguments === null) {
      const text = 'Не удалось разобрать параметры действия. Повторите, пожалуйста, какую сумму, категорию и дату внести.';
      await saveMessage(req.tenant.companyId, 'assistant', text);
      return res.json({ type: 'clarification', text });
    }

    const { valid, errors } = await tool.validate(call.arguments, req);
    if (!valid) {
      const text = errors.join(' ');
      await saveMessage(req.tenant.companyId, 'assistant', text);
      return res.json({ type: 'clarification', text });
    }

    const confirmationText = tool.buildConfirmation(call.arguments);
    // Карточка подтверждения — не обычный чат-пузырь на фронте (см.
    // PendingActionCard в AiAssistant.jsx), но в историю всё равно
    // сохраняем как assistant-сообщение — иначе после обновления страницы
    // от этого обмена не осталось бы вообще никакого следа в ленте.
    await saveMessage(req.tenant.companyId, 'assistant', confirmationText);

    return res.json({
      type: 'pending_action',
      tool: tool.name,
      params: call.arguments,
      confirmationText,
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

    const { valid, errors } = await tool.validate(params || {}, req);
    if (!valid) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const record = await tool.execute(params, req);

    // Тот же текст, что фронт сам добавляет в ленту локально
    // (AiAssistant.jsx, money(record.amount)) — сохраняем и на сервере, чтобы
    // после перезагрузки страницы этот системный пузырь тоже остался в
    // истории, не только пара вопрос/предложение действия перед ним.
    const SYSTEM_LABEL_BY_TOOL = { create_expense: 'Расход', create_income: 'Доход', log_visit: 'Визит' };
    const label = SYSTEM_LABEL_BY_TOOL[tool.name];
    if (label && record?.amount != null) {
      const formatted = `${Number(record.amount).toLocaleString('ru-RU')} ₽`;
      await saveMessage(req.tenant.companyId, 'system', `✓ ${label} ${formatted} записан`);
    }

    res.status(201).json({ tool: tool.name, record });
  })
);

module.exports = router;
