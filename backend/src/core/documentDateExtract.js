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
// Контракт сверен 30.08.2026 вручную по живой документации
// (https://aistudio.yandex.ru/ru/docs/vision/ocr/api-ref/TextRecognition/recognize)
// — владелец открыл страницу в браузере (автоматические запросы к сайту
// блокируются капчей, живому человеку — нет) и прислал скриншоты реального
// HTTP-запроса/ответа. Осталось непроверенным вживую только одно: сам факт
// успешной авторизации тем же ключом/аккаунтом, что уже использует
// core/yandexAssist.js (Vision OCR — отдельный сервис Yandex Cloud, может
// требовать своей роли IAM на сервисном аккаунте) — и точный формат
// значения mimeType (MIME-строка вида "image/jpeg" — самая естественная
// трактовка поля "mimeType": "string" из документации, но перечень
// допустимых значений в увиденных скриншотах не был явно перечислен).
const { isAiConfigured, draftText } = require('./yandexAssist');

const VISION_OCR_URL = 'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// PDF: в документации написано, что Vision OCR умеет распознавать и PDF, но
// это может относиться к отдельному асинхронному сервису (в API рядом с
// TextRecognition.Recognize есть отдельный TextRecognitionAsync — вероятно,
// именно для многостраничных PDF, раз обычный Recognize возвращает
// потоковый ответ на одно изображение) — не проверено, что синхронный
// recognizeText принимает mimeType: "application/pdf" напрямую. Сознательно
// не поддерживаем PDF в этой версии, честно возвращаем "не получилось", а
// не гадаем — расширить на PDF/асинхронный вызов отдельным заходом, когда
// будет время свериться с документацией TextRecognitionAsync.
async function ocrExtractText(imageBuffer, mimeType) {
  const res = await fetch(VISION_OCR_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Api-Key ${process.env.YANDEX_GPT_API_KEY}`,
    },
    body: JSON.stringify({
      content: imageBuffer.toString('base64'),
      mimeType,
      languageCodes: ['ru', 'en'],
      model: 'page',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Yandex Vision OCR error ${res.status}: ${body}`);
  }
  const data = await res.json();
  // Документация показывает готовое поле textAnnotation.fullText — не нужно
  // самостоятельно собирать текст из blocks/lines/words.
  return data?.textAnnotation?.fullText || '';
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
