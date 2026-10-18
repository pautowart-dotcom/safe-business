// ИИ-помощник сети в пульте (17.10.2026) — modules/franchise/networkAssistant.js.
// Доступ — как у пульта: владелец сети и его сотрудники с доступом.
// Лимит — 40 обращений в сутки на компанию сети (core/aiUsageLimit.js).
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { networkAccess } = require('../core/franchiseAccess');
const { logEvent } = require('../core/eventLog');
const { isOverDailyEventLimit, DAILY_LIMIT } = require('../core/aiUsageLimit');
const yandexAssist = require('../core/yandexAssist');
const { buildNetworkContext, restoreNames, DIGEST_PROMPT, CHAT_PROMPT } = require('../modules/franchise/networkAssistant');

const router = express.Router();
router.use(requireAuth, requireTenant, requireRole('owner', 'admin'));

const MAX_HISTORY = 6;
const MAX_TEXT = 1500;

async function guard(req, res) {
  const access = await networkAccess(req);
  if (!access) {
    res.status(404).json({ error: 'Нет доступа к пульту сети' });
    return null;
  }
  if (!yandexAssist.isAiConfigured()) {
    res.status(503).json({ error: 'ИИ пока не настроен — попробуйте позже' });
    return null;
  }
  if (await isOverDailyEventLimit(req.tenant.companyId, 'network_assistant', 'network_assistant.asked', DAILY_LIMIT)) {
    res.status(429).json({ error: 'На сегодня лимит вопросов к ИИ исчерпан — продолжите завтра' });
    return null;
  }
  return access;
}

async function ask(req, system, prompt) {
  const answer = await yandexAssist.draftText({ system, prompt, maxTokens: 700, temperature: 0.2 });
  // Только факт обращения, без текста — как у ИИ-советника точки.
  await logEvent({
    companyId: req.tenant.companyId,
    moduleKey: 'platform',
    userId: req.user.id,
    entityType: 'network_assistant',
    action: 'network_assistant.asked',
  });
  return answer;
}

// Сводка «что важно сейчас» — по кнопке, а не при каждом открытии пульта:
// каждый вызов стоит денег.
router.post(
  '/digest',
  asyncHandler(async (req, res) => {
    const access = await guard(req, res);
    if (!access) return;
    const ctx = await buildNetworkContext(access);
    try {
      const answer = await ask(req, DIGEST_PROMPT, ctx.text);
      res.json({ answer: restoreNames(answer, ctx.names) });
    } catch (err) {
      console.error('franchise-assistant /digest failed', err);
      res.status(502).json({ error: 'Не удалось получить ответ от ИИ — попробуйте ещё раз' });
    }
  })
);

// Чат. history — последние реплики с экрана ([{ role: 'user'|'assistant', text }]),
// на сервере не хранится. Названия точек в истории снова заменяем номерами.
router.post(
  '/ask',
  asyncHandler(async (req, res) => {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!question) return res.status(400).json({ error: 'Введите вопрос' });
    if (question.length > MAX_TEXT) return res.status(400).json({ error: 'Слишком длинный вопрос — сократите до 1500 символов' });
    const access = await guard(req, res);
    if (!access) return;

    const ctx = await buildNetworkContext(access);
    const { hide } = ctx;
    const history = (Array.isArray(req.body.history) ? req.body.history : [])
      .slice(-MAX_HISTORY)
      .filter((h) => h && typeof h.text === 'string' && (h.role === 'user' || h.role === 'assistant'))
      .map((h) => `${h.role === 'user' ? 'Владелец сети' : 'Помощник'}: ${hide(h.text.slice(0, MAX_TEXT))}`);

    const prompt = [
      'Факты о сети:',
      ctx.text,
      history.length ? `\nПредыдущий разговор:\n${history.join('\n')}` : '',
      `\nВопрос владельца сети: ${hide(question)}`,
    ].join('\n');

    try {
      const answer = await ask(req, CHAT_PROMPT, prompt);
      res.json({ answer: restoreNames(answer, ctx.names) });
    } catch (err) {
      console.error('franchise-assistant /ask failed', err);
      res.status(502).json({ error: 'Не удалось получить ответ от ИИ — попробуйте ещё раз' });
    }
  })
);

module.exports = router;
