// Читает публичную страницу карточки организации в Яндекс.Картах. Без
// puppeteer — проверено вручную (23.08.2026) на реальной карточке: нужные
// поля (часы, категория, фото, контакты, рейтинг, отзывы) лежат готовым
// JSON в <script type="application/json" class="state-view">, отдаются уже
// в сыром HTML без выполнения JS. Puppeteer (уже используется в проекте для
// PDF, backend/src/platform/journalGenerator.js) сюда не нужен.
//
// SSRF-защита (17.09.2026, найдено security-review) — старая проверка была
// одним regex'ом на весь URL: /^https?:\/\/(?:www\.)?yandex\.[a-z.]+\/maps\/org\/.../
// "[a-z.]+" после "yandex." допускает ДОПОЛНИТЕЛЬНЫЕ домены, склеенные точкой —
// "https://yandex.evil.com/maps/org/x/123/" проходил проверку, а fetch()
// реально шёл на evil.com (домен, полностью подконтрольный атакующему: тот
// сам решает, куда указывает DNS-запись "yandex.evil.com" — хоть на
// 127.0.0.1, хоть на внутренний сервис/метаданные облака). Эндпоинт
// публичный, без авторизации (за rate-limit'ом, не за paywall) — классический
// SSRF. Тот же класс бага, что уже был найден и закрыт в website-check/scan.js
// (assertSafeUrl/isForbiddenIp) — здесь используем более простой и надёжный
// вариант: хост должен ТОЧНО совпадать с одним из настоящих доменов
// Яндекс.Карт (без дополнительных лейблов ни до, ни после), парсинг через
// URL(), а не сборка regex'ом по сырой строке — исключает трюки с userinfo
// (https://real.yandex.ru@evil.com/...) и подобные.
const ALLOWED_HOSTS = new Set([
  'yandex.ru', 'www.yandex.ru',
  'yandex.com', 'www.yandex.com',
  'yandex.by', 'www.yandex.by',
  'yandex.kz', 'www.yandex.kz',
  'yandex.uz', 'www.yandex.uz',
]);
const ORG_PATH_RE = /^\/maps\/org\/[^/]+\/(\d+)\/?$/;

function extractOrgId(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ''));
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  const match = parsed.pathname.match(ORG_PATH_RE);
  return match ? match[1] : null;
}

async function fetchCardHtml(url) {
  const orgId = extractOrgId(url);
  if (!orgId) {
    const err = new Error('Ссылка не похожа на карточку организации в Яндекс.Картах');
    err.code = 'INVALID_URL';
    throw err;
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept-Language': 'ru-RU,ru;q=0.9',
    },
  });
  if (!res.ok) {
    const err = new Error(`Яндекс.Карты вернули ошибку ${res.status}`);
    err.code = 'FETCH_FAILED';
    throw err;
  }
  const html = await res.text();
  return { html, orgId };
}

module.exports = { fetchCardHtml, extractOrgId };
