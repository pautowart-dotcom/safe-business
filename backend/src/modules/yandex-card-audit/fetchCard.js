// Читает публичную страницу карточки организации в Яндекс.Картах. Без
// puppeteer — проверено вручную (23.08.2026) на реальной карточке: нужные
// поля (часы, категория, фото, контакты, рейтинг, отзывы) лежат готовым
// JSON в <script type="application/json" class="state-view">, отдаются уже
// в сыром HTML без выполнения JS. Puppeteer (уже используется в проекте для
// PDF, backend/src/platform/journalGenerator.js) сюда не нужен.
const ORG_URL_RE = /^https?:\/\/(?:www\.)?yandex\.[a-z.]+\/maps\/org\/[^/]+\/(\d+)\/?/i;

function extractOrgId(url) {
  const match = String(url || '').match(ORG_URL_RE);
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
