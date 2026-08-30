// Автоизвлечение даты из документа, загружаемого в "Мои сроки" (Фаза
// "постоянной необходимости" плана, см. .claude/plans/document-date-extraction.md
// — полное обоснование там). Тип документа уже известен из того, в какой
// слот его загрузили (CATALOG в my-deadlines.routes.js) — задача ИИ сужена
// до одного вопроса: "какая дата на этом конкретном документе", не
// классификация документа с нуля.
//
// Использует Anthropic (тот же fetch-паттерн, что aiAssist.js, без SDK) —
// единственный из двух уже подключённых провайдеров (второй — YandexGPT,
// yandexAssist.js) с проверенной поддержкой изображений/PDF во входе.
// Без ANTHROPIC_API_KEY модуль тихо не работает — тот же принцип, что
// aiAssist.js/pushNotify.js, деплой без настроенного ключа не падает.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isAiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Никогда не сохраняем распознанное молча (см. ТЗ) — эта функция только
// предлагает значение, вызывающий код (роут) обязан оставить сохранение
// отдельным, явным действием пользователя.
async function extractDocumentDate({ imageBuffer, mimeType, expectedLabel }) {
  if (!isAiConfigured()) {
    const err = new Error('ИИ не настроен: заполните ANTHROPIC_API_KEY в .env');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }

  const isPdf = mimeType === 'application/pdf';
  const sourceBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imageBuffer.toString('base64') } }
    : { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBuffer.toString('base64') } };

  const system =
    'Ты читаешь фото/скан документа и ищешь ОДНУ дату — срок действия, дату следующей поверки/обслуживания ' +
    'или дату окончания (в зависимости от того, что за документ). Отвечай СТРОГО в формате JSON без пояснений ' +
    'снаружи: {"found": true|false, "date": "YYYY-MM-DD"|null, "reason": string|null}. ' +
    'Если дата нечёткая, обрезана на фото, отсутствует, или документ не похож на ожидаемый — found: false, ' +
    'reason: короткое объяснение почему. Никогда не угадывай и не приблизительно оценивай дату — только то, что ' +
    'реально написано в документе.';
  const userText = `Ожидаемый документ: "${expectedLabel}". Найди дату, о которой речь в описании выше.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system,
      messages: [{ role: 'user', content: [sourceBlock, { type: 'text', text: userText }] }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  const raw = textBlock ? textBlock.text.trim() : '';

  let parsed;
  try {
    // Модель иногда оборачивает JSON в ```json ... ``` несмотря на просьбу
    // не пояснять — снимаем обёртку, если она есть, прежде чем парсить.
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    parsed = JSON.parse(cleaned);
  } catch {
    return { found: false, date: null, reason: 'Не удалось разобрать ответ ИИ' };
  }

  if (!parsed.found || typeof parsed.date !== 'string' || !DATE_RE.test(parsed.date)) {
    return { found: false, date: null, reason: parsed.reason || 'Дата не распознана' };
  }
  return { found: true, date: parsed.date, reason: null };
}

module.exports = { isAiConfigured, extractDocumentDate };
