// Каталог сегментов рынка и ниш. Источник: docs/security-engine/01_Architecture_FINAL.md §2
// и 02_Segmentation_FINAL.md §1 (шаги 3-4) — при расхождении между файлами
// правила сегментации берутся из Файла 02 (см. Файл 01 §15, "единственный источник правды").
//
// hasNicheStep=false → сегмент ведёт сразу в лист ожидания (Файл 02: Розничная
// торговля / Общепит / Другое), без показа списка ниш.
// На нишу: paidAudit — есть ли готовый контент теста (34 вопроса). Тест
// бесплатен для всех ниш; paidAudit=false просто значит "контент ещё не
// готов" — кнопка ведёт на заглушку с листом ожидания (Файл 05).

const SEGMENTS = [
  {
    key: 'beauty',
    label: 'Красота и здоровье',
    hasNicheStep: true,
    niches: [
      { key: 'manicure', label: 'Маникюр и педикюр', paidAudit: true },
      { key: 'lashes_brows', label: 'Ресницы и брови', paidAudit: false },
      { key: 'hair', label: 'Волосы (парикмахерские услуги)', paidAudit: false },
      { key: 'massage', label: 'Массаж (без медицинской лицензии)', paidAudit: false },
    ],
  },
  {
    key: 'fitness',
    label: 'Фитнес и активность',
    hasNicheStep: true,
    niches: [
      { key: 'fitness_gym', label: 'Фитнес-студия / тренажёрный зал', paidAudit: false },
      { key: 'dance', label: 'Танцы', paidAudit: false },
      { key: 'yoga', label: 'Йога / растяжка', paidAudit: false },
    ],
  },
  { key: 'retail', label: 'Розничная торговля', hasNicheStep: false, niches: [] },
  { key: 'food', label: 'Общепит', hasNicheStep: false, niches: [] },
  { key: 'other', label: 'Другое', hasNicheStep: false, niches: [] },
];

function findSegment(segmentKey) {
  return SEGMENTS.find((s) => s.key === segmentKey) || null;
}

function findNiche(segmentKey, nicheKey) {
  const segment = findSegment(segmentKey);
  if (!segment) return null;
  return segment.niches.find((n) => n.key === nicheKey) || null;
}

module.exports = { SEGMENTS, findSegment, findNiche };
