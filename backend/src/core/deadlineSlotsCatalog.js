// Каталог типов сроков "Мои сроки" — вынесен из my-deadlines.routes.js
// (30.08.2026), чтобы тем же списком мог пользоваться security.routes.js
// (автораспознавание при загрузке документа во вкладке "Документы", см.
// .claude/plans/document-date-extraction.md). Список фиксированный
// (не редактируется через БД, в отличие от journal_types) — конкретные,
// заранее известные пункты, не пользовательский контент.
const CATALOG = [
  // Кадровые
  { key: 'briefing_repeat', category: 'staff', label: 'Повторный инструктаж по охране труда — дата следующего' },
  // Помещение и оборудование
  { key: 'lease_end', category: 'premises', label: 'Договор аренды — дата окончания' },
  { key: 'fire_extinguisher', category: 'premises', label: 'Огнетушители — дата следующей перезарядки/поверки' },
  { key: 'fire_alarm_service', category: 'premises', label: 'ТО пожарной сигнализации — дата следующего' },
  { key: 'electrical_resistance', category: 'premises', label: 'Замер сопротивления изоляции электропроводки — дата следующей проверки' },
  { key: 'disinfection_contract', category: 'premises', label: 'Договор на дезинфекцию/дератизацию помещения — дата окончания' },
  // Юридические документы
  { key: 'esign', category: 'documents', label: 'Электронная подпись (ЭЦП) — дата окончания' },
  { key: 'patent_end', category: 'documents', label: 'Патент — дата окончания' },
  { key: 'license_end', category: 'documents', label: 'Лицензия — дата окончания (если применимо)' },
  { key: 'medwaste_contract', category: 'documents', label: 'Вывоз медицинских отходов класса Б — дата окончания договора' },
  { key: 'mswaste_contract', category: 'documents', label: 'Вывоз ТБО — дата окончания договора' },
];
const CATALOG_BY_KEY = Object.fromEntries(CATALOG.map((c) => [c.key, c]));

function relatedType(key) {
  return `manual:${key}`;
}

module.exports = { CATALOG, CATALOG_BY_KEY, relatedType };
