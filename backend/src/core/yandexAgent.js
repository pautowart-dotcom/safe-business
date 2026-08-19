// ИИ-ассистент с function calling (первый узкий срез, 19.08.2026 — задача
// владельца "первый срез ИИ-ассистента"). Отдельный модуль от
// core/yandexAssist.js намеренно: yandexAssist.js бьёт в Foundation Models
// Completion API (llm.api.cloud.yandex.net/foundationModels), который НЕ
// поддерживает function calling. Вызов функций у Yandex работает только
// через отдельный, OpenAI-совместимый эндпоинт — ai.api.cloud.yandex.net/v1
// (документация aistudio.yandex.ru, "How to send a function-calling
// request" + "Specifics of API implementation in Yandex Cloud AI Studio",
// проверено поиском август 2026, вживую реальным ключом не проверено —
// владелец подключит ключ сам на сервере, как и с yandexAssist.js).
//
// 19.08.2026, подтверждено вживую владельцем (скриншот aistudio.yandex.ru,
// "Создание API-ключа"): это ДЕЙСТВИТЕЛЬНО отдельный ключ, не переиспользование
// YANDEX_GPT_API_KEY — интерфейс AI Studio создаёт свой API-ключ + свой
// сервисный аккаунт с минимальными ролями именно под этот продукт, отдельно
// от того сервисного аккаунта/ключа, что уже работает для yandexAssist.js
// (Foundation Models). Поэтому отдельная переменная — YANDEX_AI_STUDIO_API_KEY.
// YANDEX_FOLDER_ID переиспользуем — это id каталога Yandex Cloud, не часть
// ключа, тот же каталог для обоих сервисов.
//
// Модель — ОТДЕЛЬНАЯ переменная YANDEX_GPT_AGENT_MODEL (не YANDEX_GPT_MODEL):
// function calling требует модель, которая это умеет (yandexgpt/rc —
// YandexGPT Pro 5.1, по документации поддерживает tools), а YANDEX_GPT_MODEL
// уже занята под yandexgpt-lite/latest для текстовых советников
// (margin-advisor и т.д.) — смешивать их означает, что один флаг окружения
// начнёт влиять на два разных, технически несовместимых сценария использования.
const AGENT_MODEL_SUFFIX = process.env.YANDEX_GPT_AGENT_MODEL || 'yandexgpt/rc';
const AGENT_CHAT_URL = 'https://ai.api.cloud.yandex.net/v1/chat/completions';

function isAiConfigured() {
  return !!process.env.YANDEX_AI_STUDIO_API_KEY && !!process.env.YANDEX_FOLDER_ID;
}

// messages — обычный OpenAI-формат ([{role, content}, ...], role один из
// 'system'/'user'/'assistant'). tools — OpenAI-формат function calling
// ([{type:'function', function:{name, description, parameters}}, ...]),
// см. modules/ai-assistant/tools/registry.js:listToolDefinitions().
//
// Возвращает либо { type: 'text', text }, либо { type: 'tool_calls',
// toolCalls: [{ id, name, arguments }] } — arguments уже распарсен из JSON
// (или null, если модель вернула невалидный JSON — вызывающий код должен
// сам решить, что с этим делать, здесь не гадаем).
async function chat({ messages, tools, maxTokens = 800, temperature = 0.2 }) {
  if (!isAiConfigured()) {
    const err = new Error('ИИ-ассистент не настроен: заполните YANDEX_AI_STUDIO_API_KEY и YANDEX_FOLDER_ID в .env');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }

  const modelUri = `gpt://${process.env.YANDEX_FOLDER_ID}/${AGENT_MODEL_SUFFIX}`;
  const body = {
    model: modelUri,
    messages,
    max_tokens: maxTokens,
    temperature,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const res = await fetch(AGENT_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Api-Key — формат заголовка пока не проверен вживую реальным ключом
      // (только что созданным через AI Studio, "Создание API-ключа") — если
      // после подстановки ключа всё ещё 401/403, первое, что проверить:
      // может понадобиться `Bearer` вместо `Api-Key` (AI Studio — отдельный,
      // OpenAI-совместимый продукт, необязательно повторяет формат
      // Foundation Models). Folder id для OpenAI-совместимого эндпоинта
      // передаётся заголовком, а не частью URL — по документации это
      // `OpenAI-Project`; дублируем в `x-folder-id`, который встречается в
      // примерах для других эндпоинтов Yandex Cloud — лишний заголовок
      // безвреден, а живого ключа для проверки, какой именно заголовок
      // реально нужен именно этому эндпоинту, на момент написания не было.
      Authorization: `Api-Key ${process.env.YANDEX_AI_STUDIO_API_KEY}`,
      'OpenAI-Project': process.env.YANDEX_FOLDER_ID,
      'x-folder-id': process.env.YANDEX_FOLDER_ID,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Yandex AI Studio API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  if (!message) {
    throw new Error('Yandex AI Studio: пустой ответ модели');
  }

  const rawToolCalls = message.tool_calls;
  if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
    const toolCalls = rawToolCalls.map((tc) => {
      let args;
      try {
        args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch {
        args = null;
      }
      return { id: tc.id, name: tc.function?.name, arguments: args };
    });
    return { type: 'tool_calls', toolCalls };
  }

  return { type: 'text', text: message.content || '' };
}

module.exports = { isAiConfigured, chat, AGENT_MODEL_SUFFIX };
