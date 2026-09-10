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
  // fitness_gym/dance/yoga (paidAudit: true с 07-08.09.2026) и pilates
  // (09.09.2026) отсутствовали здесь до 09.09.2026 — найдено при добавлении
  // pilates: с 08.09.2026 их физически нельзя было выбрать ни в анонимном
  // тесте (AnonymousAudit.jsx), ни при регистрации (Login.jsx), хотя тест и
  // roadmap для них уже были live. Тот же класс бага, что чинили в
  // start.html (см. project_roadmap_niche_sync_2026_09_08 в памяти).
  ['fitness_gym', 'Фитнес-студия / тренажёрный зал', 'fitness'],
  ['dance', 'Танцы', 'fitness'],
  ['yoga', 'Йога / растяжка', 'fitness'],
  ['pilates', 'Пилатес', 'fitness'],
  ['martial_arts', 'Бокс и единоборства', 'fitness'],
  // atelier/shoe_repair (10.09.2026) — сегмент "Бытовые услуги".
  ['atelier', 'Ателье (пошив и ремонт одежды)', 'household'],
  ['shoe_repair', 'Ремонт обуви', 'household'],
  ['photo_studio', 'Фотостудия', 'household'],
  // cafe_basic (paidAudit: true с 10.09.2026) отсутствовал здесь, пока
  // paidAudit было false — тот же класс бага, что с fitness_gym/dance/yoga
  // 09.09.2026 (см. project_pilates_niche_2026_09_09 в памяти).
  ['cafe_basic', 'Кафе, кофейня, столовая (без алкоголя)', 'food'],
  // Фаза C (30.08.2026) — общий слой для бизнеса без отраслевой ниши
  // (сегменты 'retail'/'other' в backend/.../segments.js используют один и
  // тот же ключ 'universal'). Сегмент здесь — 'other', просто дефолт для
  // предзаполнения формы (segmentForNiche) — сам тест не отличается для
  // 'retail' vs 'other', значение только для текста/подписи.
  ['universal', 'Общие требования (без отраслевой специфики)', 'other'],
];

export function segmentForNiche(nicheKey) {
  return NICHE_OPTIONS.find(([key]) => key === nicheKey)?.[2] || null;
}
