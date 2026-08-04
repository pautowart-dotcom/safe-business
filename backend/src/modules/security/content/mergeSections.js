// Слияние справочного контента (обязательные документы, зоны внимания) по
// нескольким нишам — задача явно просила не делать полный рефакторинг
// контента (без тегов/дедупа вопросов), но названия разделов (title) уже
// совпадают дословно между всеми 4 нишами "Красота и здоровье" (проверено
// вручную по content/pdf/*/*.js), так что слияние по title даёт честный
// объединённый список без повторов, а не просто "подряд по нишам".

// sectionsPerNiche — [[{ title, employerOnly, items: string[] }], ...], по
// одному массиву секций на нишу. Объединяет секции с одинаковым title,
// список items — union с сохранением порядка первого появления.
function mergeDocumentSections(sectionsPerNiche) {
  const byTitle = new Map();
  for (const sections of sectionsPerNiche) {
    for (const section of sections) {
      if (!byTitle.has(section.title)) {
        byTitle.set(section.title, { title: section.title, employerOnly: section.employerOnly, items: [] });
      }
      const target = byTitle.get(section.title);
      for (const item of section.items) {
        if (!target.items.includes(item)) target.items.push(item);
      }
    }
  }
  return [...byTitle.values()];
}

// zonesPerNiche — [[{ title, issue, checkWhat, normBase }], ...]. Контент зон
// с одинаковым title почти идентичен между нишами — берём первое вхождение,
// не пытаемся склеивать текст разных ниш в одну зону.
function mergeAttentionZones(zonesPerNiche) {
  const byTitle = new Map();
  for (const zones of zonesPerNiche) {
    for (const zone of zones) {
      if (!byTitle.has(zone.title)) byTitle.set(zone.title, zone);
    }
  }
  return [...byTitle.values()];
}

module.exports = { mergeDocumentSections, mergeAttentionZones };
