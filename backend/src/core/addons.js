// Единственное место, где перечислены разовые платные надстройки и их цена
// (миграция 0075). Добавить новый addon — одна новая запись здесь, ничего
// больше менять не нужно (checkout/webhook/requireAddon читают только этот
// каталог).
//
// ВНИМАНИЕ: цена "Шаблонов документов" — 2990 ₽ — предварительная заглушка,
// владелец должен подтвердить или поменять перед тем, как открывать оплату
// реальным клиентам (сейчас функция и так закрыта requireTestCompany).
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
