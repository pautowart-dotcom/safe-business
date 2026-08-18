// Справочник ниш сегмента "Красота и здоровье" — источник:
// backend/src/modules/security/content/segments.js (SEGMENTS[0].niches).
// Дублируется на фронте намеренно: список из 4 готовых ниш меняется редко
// и одновременно на бэке и фронте, отдельный API-запрос ради статичных
// подписей был бы лишним.
export const NICHE_LABELS = {
  manicure: 'Маникюр и педикюр',
  lashes_brows: 'Ресницы и брови',
  hair: 'Волосы',
  massage: 'Массаж',
  tattoo: 'Тату, пирсинг и ПМ',
  depilation: 'Депиляция',
  solarium: 'Солярий',
  cleaning_basic: 'Уборка помещений',
};

export function nicheLabel(key) {
  return NICHE_LABELS[key] || key;
}
