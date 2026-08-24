// Чек-лист заполненности карточки. Каждое правило проверяет одно поле,
// найденное parseCard'ом, и решает, стоит ли поднимать его как рекомендацию.
// Продуктовое правило: минимум одна рекомендация всегда (см. runChecklist) —
// если все жёсткие правила ниже прошли, добавляется одна "мягкая" из ротации.

const RULES = [
  {
    code: 'hours',
    check: (f) => !f.workingTimeText,
    text: 'Часы работы не указаны — часть посетителей отсеется, не дозвонившись узнать, открыто ли сейчас.',
  },
  {
    code: 'category',
    check: (f) => !f.categoryName,
    text: 'Категория/рубрика не указана — карточка хуже находится по тематическим запросам и разделам.',
  },
  {
    code: 'photos_missing',
    check: (f) => f.photosCount == null || f.photosCount === 0,
    text: 'Фото нет совсем — это одна из первых вещей, на которую смотрят перед тем, как записаться.',
  },
  {
    code: 'photos_few',
    check: (f) => f.photosCount != null && f.photosCount > 0 && f.photosCount < 10,
    text: 'Фото мало ({photosCount} шт.) — карточкам с большим количеством фото обычно больше доверяют.',
  },
  {
    code: 'description_missing',
    check: (f) => !f.description || f.descriptionIsJustAddress,
    text: 'Описания нет — Яндекс показывает вместо него просто адрес. Стоит коротко написать, какие услуги вы оказываете и для кого.',
  },
  {
    code: 'contacts',
    check: (f) => f.phonesCount === 0,
    text: 'Телефон не указан — часть клиентов не станет писать в мессенджер и просто уйдёт к тому, кому можно позвонить.',
  },
  {
    code: 'website_or_social',
    check: (f) => f.websiteUrlsCount === 0 && f.socialLinksCount === 0,
    text: 'Нет ссылки ни на сайт, ни на соцсети — некуда перейти узнать больше об услугах и ценах.',
  },
  {
    code: 'reviews_missing',
    check: (f) => !f.reviewCount || f.reviewCount === 0,
    text: 'Отзывов пока нет — карточка без отзывов вызывает меньше доверия, стоит попросить постоянных клиентов оставить пару слов.',
  },
  {
    code: 'reviews_no_replies',
    check: (f) => f.recentReviewsSample > 0 && f.recentReviewsWithReply === 0,
    text: 'На последние отзывы нет ответов от вас — ответ виден всем посетителям карточки, не только автору отзыва.',
  },
];

// "Мягкие" рекомендации — на случай, если все жёсткие правила прошли.
// Ротация по orgId, чтобы одна и та же карточка при повторной проверке не
// получала каждый раз одно и то же (и разные карточки не получали всегда
// первую по списку).
const SOFT_SUGGESTIONS = [
  'Формально всё заполнено — стоит время от времени обновлять фото, чтобы карточка не выглядела "застывшей".',
  'Формально всё заполнено — проверьте, упоминает ли описание все актуальные услуги, включая новые.',
  'Формально всё заполнено — если появлялись новые отзывы в последний месяц, убедитесь, что на них есть ответ.',
  'Формально всё заполнено — сверьте часы работы с фактическими, особенно если недавно менялся график.',
];

function fillTemplate(text, fields) {
  return text.replace(/\{(\w+)\}/g, (_, key) => fields[key] ?? '');
}

function runChecklist(fields, orgId) {
  const findings = RULES
    .filter((rule) => rule.check(fields))
    .map((rule) => ({ code: rule.code, text: fillTemplate(rule.text, fields) }));

  if (findings.length === 0) {
    const idx = Number(String(orgId).slice(-1)) % SOFT_SUGGESTIONS.length;
    findings.push({ code: 'soft_always', text: SOFT_SUGGESTIONS[idx] });
  }

  return findings;
}

module.exports = { runChecklist };
