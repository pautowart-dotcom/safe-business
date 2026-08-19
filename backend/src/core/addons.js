// Единственное место, где перечислены разовые платные надстройки и их цена
// (миграция 0075). Добавить новый addon — одна новая запись здесь, ничего
// больше менять не нужно (checkout/webhook/requireAddon читают только этот
// каталог).
//
// ВНИМАНИЕ: цена "Шаблонов документов" — 2990 ₽ — предварительная заглушка,
// владелец должен подтвердить или поменять перед тем, как открывать оплату
// реальным клиентам (сейчас функция и так закрыта requireTestCompany).
//
// ИИ-советники (маржа/скидки/уход мастера) — НЕ в этом каталоге и никогда
// не будут: владелец решил (18.08.2026), что это отдельная ЕЖЕМЕСЯЧНАЯ
// подписка, а не разовая покупка, как всё остальное здесь. Построена
// 19.08.2026 отдельным механизмом — миграция 0090, backend/src/platform/
// ai-advisor-subscription.routes.js, requireAiAdvisorSubscription
// (core/middleware/subscription.js) — по образцу повторных списаний базовой
// подписки (subscription.routes.js), а не addon_purchases.
const ADDON_CATALOG = {
  document_templates: {
    label: 'Шаблоны документов',
    priceRub: 2990,
  },
};

function getAddon(addonKey) {
  return ADDON_CATALOG[addonKey] || null;
}

module.exports = { ADDON_CATALOG, getAddon };
