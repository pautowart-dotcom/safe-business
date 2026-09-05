// Резолвер правил показа по профилю компании (05.09.2026, вынесено из
// modules/security/content/visibility.js) — межмодульная сущность: нужна и
// тесту безопасности (какие вопросы/нарушения показывать), и генерации
// документов (какие пункты документа включать), поэтому живёт в core/, а не
// в содержимом одного конкретного модуля. security/content/visibility.js
// остался тонким ре-экспортом отсюда — ни один вызывающий код в security не
// менялся.
//
// showIf — имя предиката из словаря ниже, а не JS-функция: набор
// вопросов/пунктов документа остаётся декларативным и переносимым в БД без
// переписывания этого файла — сюда только добавляются новые ключи в
// PREDICATES.
//
// profile = { legalForm: 'self_employed'|'ip'|'ooo', workModel: 'alone'|'employees'|'sublet'|'mixed', hasPremises, hairChemicalTreatments }

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

  // Блок 8 ниши "Волосы" (химические процедуры — кератин, ботокс для волос,
  // сложная завивка): показывается только тем, кто отметил такие услуги при
  // выборе ниши (security_profile_niches.chemical_treatments). По умолчанию
  // скрыт — обычная парикмахерская без этих составов блок не видит.
  has_hair_chemical_treatments: (profile) => profile.hairChemicalTreatments === true,

  // Универсальный слой (Фаза C, 30.08.2026, ниша 'universal' для бизнеса без
  // готовой нишевой матрицы) — блок "пожарная безопасность и эксплуатация
  // помещения" показывается только тем, у кого есть отдельное нежилое
  // помещение (security_profile_niches.has_premises), не работающим только
  // на территории клиента/из дома.
  has_premises: (profile) => profile.hasPremises === true,

  // Вопрос про онлайн-кассу (УНИ-102) неприменим к самозанятым — чек
  // формируется в приложении "Мой налог", обязанности по 54-ФЗ нет.
  not_self_employed: (profile) => profile.legalForm !== 'self_employed',

  // Приём клиентов в жилом помещении (05.09.2026, реальный вопрос клиентки +
  // MN-101-доп в violations/manicure.js) — не берётся из security_profiles
  // (там нет такого поля сегментации), а вычисляется на лету по ответу на
  // конкретный вопрос теста (см. modules/document-templates/homePremisesSignal.js).
  // profile.worksFromHome — не колонка БД, а посчитанное значение, которое
  // вызывающий код обязан положить в объект profile сам перед проверкой.
  works_from_home: (profile) => profile.worksFromHome === true,
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
