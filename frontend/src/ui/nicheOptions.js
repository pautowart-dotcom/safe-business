// Плоский список ниш с готовым контентом теста (paidAudit: true в
// backend/src/modules/security/content/segments.js) — единственный источник
// правды по-прежнему бэкенд, это отображательный дубликат (тот же принцип,
// что и у SEGMENTS в Security.jsx, там есть отдельный комментарий об этом).
// Раньше жил только внутри AnonymousAudit.jsx — вынесен сюда 20.08.2026,
// когда тот же список понадобился ещё в двух местах: форме регистрации
// (Login.jsx, спрашивает нишу сразу) и предзаполнении SegmentationForm
// (Security.jsx, чтобы не спрашивать нишу дважды).
export const NICHE_OPTIONS = [
  ['manicure', 'Маникюр и педикюр', 'beauty'],
  ['lashes_brows', 'Ресницы и брови', 'beauty'],
  ['hair', 'Волосы (парикмахерские услуги)', 'beauty'],
  ['massage', 'Массаж (без медицинской лицензии)', 'beauty'],
  ['tattoo', 'Тату, пирсинг и перманентный макияж', 'beauty'],
  ['depilation', 'Депиляция (шугаринг, воск, нить)', 'beauty'],
  ['solarium', 'Солярий', 'beauty'],
  ['barbershop', 'Барбершоп', 'beauty'],
  ['cleaning_basic', 'Уборка помещений (жильё и офисы)', 'cleaning'],
];

export function segmentForNiche(nicheKey) {
  return NICHE_OPTIONS.find(([key]) => key === nicheKey)?.[2] || null;
}
