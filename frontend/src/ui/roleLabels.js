// Термин для роли "мастер" — по умолчанию общий для индустрии красоты
// (маникюр/барбершоп и т.д., откуда выросло приложение). Ниши с другим
// принятым словом — 20.08.2026, первый повод: клининг ("Сотрудник", не
// "Мастер"). Формы нужны для верной грамматики ("Мастеров пока нет" /
// "Сотрудников пока нет") — только там, где реально используется
// множественное число, не автосклонение "+ов" (хрупко на будущих нишах).
const DEFAULT_LABEL = { nominative: 'Мастер', nominativePlural: 'Мастера', genitivePlural: 'Мастеров' };

const NICHE_LABELS = {
  cleaning_basic: { nominative: 'Сотрудник', nominativePlural: 'Сотрудники', genitivePlural: 'Сотрудников' },
};

// Если у компании несколько ниш (мультивыбор в "Красота и здоровье") и хотя
// бы одна — со своим термином, берём первую найденную с явным маппингом,
// иначе дефолт "Мастер" — безопасное поведение для всех существующих ниш,
// не меняет ничего, если новой ниши в NICHE_LABELS нет.
function labelFor(niches) {
  for (const niche of niches || []) {
    if (NICHE_LABELS[niche]) return NICHE_LABELS[niche];
  }
  return DEFAULT_LABEL;
}

export function masterLabel(niches) {
  return labelFor(niches).nominative;
}
export function masterLabelPlural(niches) {
  return labelFor(niches).nominativePlural;
}
export function masterLabelGenitivePlural(niches) {
  return labelFor(niches).genitivePlural;
}
