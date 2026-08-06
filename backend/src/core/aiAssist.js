// Черновики ответов поддержки от ИИ (Фаза 1 "журнала решений", обсуждение
// 06.08.2026). Без SDK — обычный fetch на Messages API, чтобы не тащить
// новую зависимость ради одного эндпоинта. Без ANTHROPIC_API_KEY в .env
// модуль тихо ничего не делает — тот же паттерн, что pushNotify.js
// (isPushConfigured), чтобы деплой без настроенного ключа не падал.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

function isAiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

async function draftText({ system, prompt, maxTokens = 1024 }) {
  if (!isAiConfigured()) {
    const err = new Error('ИИ не настроен: заполните ANTHROPIC_API_KEY в .env');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  return textBlock ? textBlock.text : '';
}

module.exports = { isAiConfigured, draftText };
