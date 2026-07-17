// Резолвер правил показа вопросов. Источник: docs/security-engine/02_Segmentation_FINAL.md.
// showIf на вопросе — это имя предиката из словаря ниже, а не JS-функция:
// так набор вопросов остаётся декларативным и переносимым в БД (колонка
// visibility_rule) без переписывания этого файла — сюда только добавляются
// новые ключи в PREDICATES.
//
// profile = { legalForm: 'self_employed'|'ip'|'ooo', workModel: 'alone'|'employees'|'sublet'|'mixed' }

const PREDICATES = {
  // Кадровый блок (Файл 02 §3: трудовые договоры, медкнижки, инструктаж, СОУТ).
  // Показывать: ИП/ООО + (сотрудники|смешанная модель). Самозанятый и "работаю
  // один" всегда скрыты — единственный явный случай в "не показывать".
  has_employees: (profile) =>
    profile.legalForm !== 'self_employed' && (profile.workModel === 'employees' || profile.workModel === 'mixed'),

  // Подмена трудовых отношений (MN-502, Файл 02 §5): показывается шире, чем
  // остальной кадровый блок — включая "сдаю рабочие места", т.к. вопрос не про
  // штат владельца, а про то, как оформлены любые специалисты в помещении.
  // Файл 06 группирует MN-502 в "Блок 4: показывать только если есть сотрудники"
  // со ссылкой "правило — Файл 02" — при расхождении берём более детальное
  // правило самого Файла 02 (единственный источник правды по сегментации).
  not_alone: (profile) => profile.workModel !== 'alone',
};

function isVisible(showIf, profile) {
  if (!showIf) return true;
  const predicate = PREDICATES[showIf];
  if (!predicate) throw new Error(`Неизвестное правило показа: ${showIf}`);
  return predicate(profile);
}

function filterVisible(items, profile) {
  return items.filter((item) => isVisible(item.showIf, profile));
}

module.exports = { isVisible, filterVisible, PREDICATES };
