// Черновики текста поверх ИИ-советника по марже (Этап 6 плана аналитики,
// docs/plan-2026-08-15-analytics-ai-monthly-summary.md) — по решению
// владельца эта конкретная фича использует YandexGPT (Yandex Foundation
// Models), а не Anthropic — отдельный API-контракт, поэтому отдельный
// модуль, не расширение aiAssist.js. Тот же принцип: без SDK, обычный
// fetch, без ключей в .env модуль тихо ничего не делает (isAiConfigured())
// — деплой без настроенного ключа не падает, как pushNotify.js/aiAssist.js.
//
// Нужны ДВЕ переменные окружения (в отличие от Anthropic, где хватает
// одного ключа) — Foundation Models адресует модель через modelUri вида
// "gpt://<folder_id>/<модель>", folder id не часть самого ключа:
//   YANDEX_GPT_API_KEY — статический API-ключ сервисного аккаунта Yandex
//     Cloud (Api-Key, не IAM-токен — тот истекает за 12 часов и потребовал
//     бы отдельного обновления, для сервера с длительным временем жизни
//     статический ключ проще и это официально поддерживаемый способ).
//   YANDEX_FOLDER_ID — id каталога Yandex Cloud, в котором выпущен ключ.
// Формат по документации Yandex Cloud Foundation Models (проверено через
// поиск, август 2026) — НЕ проверено вживую реальным ключом, владелец
// подключит ключ сам на сервере.
const MODEL_URI_SUFFIX = process.env.YANDEX_GPT_MODEL || 'yandexgpt-lite/latest';
const COMPLETION_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion';

function isAiConfigured() {
  return !!process.env.YANDEX_GPT_API_KEY && !!process.env.YANDEX_FOLDER_ID;
}

async function draftText({ system, prompt, maxTokens = 1000, temperature = 0.3 }) {
  if (!isAiConfigured()) {
    const err = new Error('ИИ не настроен: заполните YANDEX_GPT_API_KEY и YANDEX_FOLDER_ID в .env');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }

  const modelUri = `gpt://${process.env.YANDEX_FOLDER_ID}/${MODEL_URI_SUFFIX}`;
  const messages = [];
  if (system) messages.push({ role: 'system', text: system });
  messages.push({ role: 'user', text: prompt });

  const res = await fetch(COMPLETION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Api-Key — статический ключ сервисного аккаунта; альтернатива Bearer
      // <IAM-token> у Yandex Cloud тоже валидна, но требует отдельного
      // обновления токена каждые 12 часов — не подходит для простого
      // серверного модуля без фонового обновления токенов.
      Authorization: `Api-Key ${process.env.YANDEX_GPT_API_KEY}`,
    },
    body: JSON.stringify({
      modelUri,
      completionOptions: {
        stream: false,
        temperature,
        // Foundation Models API ждёт maxTokens строкой, не числом.
        maxTokens: String(maxTokens),
      },
      messages,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YandexGPT API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  const alternative = data?.result?.alternatives?.[0];
  return alternative?.message?.text || '';
}

module.exports = { isAiConfigured, draftText };
