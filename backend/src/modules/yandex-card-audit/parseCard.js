// Достаёт структурированные данные организации из HTML страницы Яндекс.Карт.
// Данные лежат готовым JSON в <script type="application/json" class="state-view">
// (внутреннее состояние SSR-рендера страницы, не документированный публичный
// API) — при изменении вёрстки Яндексом этот парсинг может сломаться, тогда
// первым делом смотреть сюда.
const STATE_SCRIPT_RE = /<script type="application\/json" class="state-view">([\s\S]*?)<\/script>/;

function findOrgById(state, orgId) {
  const stacks = state.stack || [];
  for (const stack of stacks) {
    const items = stack?.results?.items || [];
    const found = items.find((item) => String(item.id) === String(orgId));
    if (found) return found;
  }
  return stacks[0]?.results?.items?.[0] || null;
}

function parseCard(html, orgId) {
  const match = html.match(STATE_SCRIPT_RE);
  if (!match) {
    const err = new Error('Не удалось прочитать данные карточки — возможно, изменился формат страницы Яндекс.Карт');
    err.code = 'PARSE_FAILED';
    throw err;
  }

  let state;
  try {
    state = JSON.parse(match[1]);
  } catch {
    const err = new Error('Не удалось прочитать данные карточки — возможно, изменился формат страницы Яндекс.Карт');
    err.code = 'PARSE_FAILED';
    throw err;
  }

  const org = findOrgById(state, orgId);
  if (!org) {
    const err = new Error('Карточка не найдена — проверьте ссылку');
    err.code = 'ORG_NOT_FOUND';
    throw err;
  }

  const recentReviews = org.reviewResults?.reviews || [];

  return {
    title: org.title || null,
    address: org.fullAddress || org.address || null,
    // description у Яндекса по умолчанию равен адресу, если владелец ничего
    // не написал сам — поэтому "нет описания" проверяется явно, не просто
    // на пустую строку.
    description: org.description || null,
    descriptionIsJustAddress: !!org.description && !!org.address && org.description.trim() === org.address.trim(),
    categoryName: org.categories?.[0]?.name || null,
    photosCount: org.photos?.count ?? null,
    workingTimeText: org.workingTimeText || null,
    isOpenNow: org.currentWorkingStatus?.isOpenNow ?? null,
    phonesCount: (org.phones || []).length,
    socialLinksCount: (org.socialLinks || []).length,
    websiteUrlsCount: (org.urls || []).length,
    ratingValue: org.ratingData?.ratingValue ?? null,
    ratingCount: org.ratingData?.ratingCount ?? null,
    reviewCount: org.ratingData?.reviewCount ?? null,
    hasVerifiedOwner: !!org.businessProperties?.has_verified_owner,
    recentReviewsSample: recentReviews.length,
    recentReviewsWithReply: recentReviews.filter((r) => !!r.businessComment).length,
  };
}

module.exports = { parseCard };
