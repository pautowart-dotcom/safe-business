// Автоизвлечение даты из документа, загружаемого в "Мои сроки" (см.
// .claude/plans/document-date-extraction.md). Тип документа уже известен из
// того, в какой слот его загрузили (CATALOG в my-deadlines.routes.js) —
// задача ИИ сужена до одного вопроса: "какая дата на этом документе".
//
// РОССИЙСКИЙ КОНТУР ОБЯЗАТЕЛЕН (30.08.2026, владелец поправил первую
// версию на Anthropic) — фото документов вроде медкнижки содержат
// персональные, местами медицинские данные; отправка за границу без
// уведомления РКН — трансграничная передача персональных данных по 152-ФЗ,
// реальный юридический риск, не формальность. Два шага вместо одного
// запроса, оба — российский контур:
//   1. Yandex Vision OCR — вытаскивает текст с фото документа.
//   2. YandexGPT (уже подключён, core/yandexAssist.js) — ищет в этом тексте
//      конкретную дату, с учётом описания ожидаемого документа.
// Используют один и тот же аккаунт/ключ (YANDEX_GPT_API_KEY, YANDEX_FOLDER_ID)
// — Vision OCR может требовать отдельной роли IAM на том же сервисном
// аккаунте, не проверено вживую, владелец должен сверить при подключении.
//
// НЕ ПРОВЕРЕНО ПРОТИВ ЖИВОЙ ДОКУМЕНТАЦИИ (30.08.2026) — при попытке свериться
// с https://aistudio.yandex.ru/docs/ru/vision/concepts/ocr/ получена капча
// (тот же класс проблемы, что "Yandex card audit frozen" — сайт блокирует
// автоматические запросы). Ниже — классический, годами стабильный REST-
// контракт Yandex Cloud Vision (batchAnalyze), который скорее всего всё ещё
// работает под капотом нового бренда "AI Studio", но это предположение, не
// факт. Перед реальным использованием открыть страницу доков вручную в
// браузере (капча блокирует только автоматические запросы, не человека) и
// свериться: URL эндпоинта, точную форму тела запроса и ответа.
const { isAiConfigured, draftText } = require('./yandexAssist');

const VISION_OCR_URL = 'https://vision.api.cloud.yandex.net/vision/v1/batchAnalyze';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// PDF: classический Vision batchAnalyze исторически работает с изображениями,
// не с сырым PDF (для PDF обычно нужен отдельный режим/рендер страниц в
// картинки) — не проверено, поэтому сознательно не поддерживаем PDF в этой
// версии, честно возвращаем "не получилось", а не гадаем.
async function ocrExtractText(imageBuffer, mimeType) {
  const res = await fetch(VISION_OCR_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Api-Key ${process.env.YANDEX_GPT_API_KEY}`,
    },
    body: JSON.stringify({
      folderId: process.env.YANDEX_FOLDER_ID,
      analyze_specs: [
        {
          content: imageBuffer.toString('base64'),
          features: [{ type: 'TEXT_DETECTION', text_detection_config: { language_codes: ['ru', 'en'] } }],
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Yandex Vision OCR error ${res.status}: ${body}`);
  }
  const data = await res.json();
  const pages = data?.results?.[0]?.results?.[0]?.textDetection?.pages || [];
  const lines = [];
  for (const page of pages) {
    for (const block of page.blocks || []) {
      for (const line of block.lines || []) {
        const text = (line.words || []).map((w) => w.text).join(' ');
        if (text) lines.push(text);
      }
    }
  }
  return lines.join('\n');
}

function parseJsonResponse(raw) {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// Никогда не сохраняет ничего сама — только предлагает значение, вызывающий
// роут обязан оставить сохранение отдельным, явным действием пользователя.
async function extractDocumentDate({ imageBuffer, mimeType, expectedLabel }) {
  if (!isAiConfigured()) {
    const err = new Error('ИИ не настроен: заполните YANDEX_GPT_API_KEY и YANDEX_FOLDER_ID в .env');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }

  if (mimeType === 'application/pdf') {
    return { found: false, date: null, reason: 'Распознавание PDF пока не поддерживается — загрузите фото или скан как изображение.' };
  }

  let text;
  try {
    text = await ocrExtractText(imageBuffer, mimeType);
  } catch (err) {
    return { found: false, date: null, reason: 'Не удалось прочитать документ (OCR-сервис недоступен или вернул ошибку)' };
  }
  if (!text.trim()) {
    return { found: false, date: null, reason: 'Не удалось распознать текст на изображении' };
  }

  const system =
    'Тебе дан распознанный (OCR) текст документа и описание того, что это должен быть за документ. ' +
    'Найди в тексте ОДНУ дату — срок действия, дату следующей поверки/обслуживания или дату окончания ' +
    '(в зависимости от описания). Отвечай СТРОГО в формате JSON без пояснений снаружи: ' +
    '{"found": true|false, "date": "YYYY-MM-DD"|null, "reason": string|null}. ' +
    'OCR-текст может содержать мелкие ошибки распознавания (перепутанные похожие символы) — если дата логически ' +
    'ясна несмотря на это, всё равно верни её. Если дата отсутствует, неоднозначна или текст не похож на ' +
    'ожидаемый документ — found: false, reason: короткое объяснение почему. Никогда не угадывай дату.';
  const prompt = `Ожидаемый документ: "${expectedLabel}".\n\nРаспознанный текст документа:\n${text}`;

  let raw;
  try {
    raw = await draftText({ system, prompt, maxTokens: 200, temperature: 0.1 });
  } catch (err) {
    return { found: false, date: null, reason: 'Не удалось обработать документ' };
  }

  const parsed = parseJsonResponse(raw);
  if (!parsed || !parsed.found || typeof parsed.date !== 'string' || !DATE_RE.test(parsed.date)) {
    return { found: false, date: null, reason: parsed?.reason || 'Дата не распознана' };
  }
  return { found: true, date: parsed.date, reason: null };
}

module.exports = { isAiConfigured, extractDocumentDate };
