// YandexGPT (Yandex Cloud Foundation Models) — тот же контракт, что
// backend/src/core/yandexAssist.js, но с историей диалога. Без ключей —
// бросает AI_NOT_CONFIGURED, бот тогда передаёт всё администратору.
const COMPLETION_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion';

function isAiConfigured() {
  return !!process.env.YANDEX_GPT_API_KEY && !!process.env.YANDEX_FOLDER_ID;
}

// messages: [{ role: 'system' | 'user' | 'assistant', text }]
async function complete(messages, { maxTokens = 1200, temperature = 0.2 } = {}) {
  if (!isAiConfigured()) {
    const err = new Error('ИИ не настроен: YANDEX_GPT_API_KEY и YANDEX_FOLDER_ID');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }
  const model = process.env.YANDEX_GPT_MODEL || 'yandexgpt/latest';
  const res = await fetch(COMPLETION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Api-Key ${process.env.YANDEX_GPT_API_KEY}` },
    body: JSON.stringify({
      modelUri: `gpt://${process.env.YANDEX_FOLDER_ID}/${model}`,
      // Foundation Models API ждёт maxTokens строкой.
      completionOptions: { stream: false, temperature, maxTokens: String(maxTokens) },
      messages,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YandexGPT ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.result?.alternatives?.[0]?.message?.text || '';
}

module.exports = { isAiConfigured, complete };
