// Платный аудит, ниша "Мойка окон и фасадов (промышленный альпинизм)" —
// вторая ниша сегмента "Клининг". Блоки 6, 9 идентичны остальным нишам (см.
// violations/facade-cleaning.js — та же нормативная база и штрафы). Блок 4
// НЕ содержит пункта про медкнижки (не применимо к этой нише, см.
// комментарий в шапке violations/facade-cleaning.js) и НЕ использует общий
// laborMisrepresentationQuestion() без изменений кода (код совпадает с
// хелпером, поэтому здесь используется как есть). FC-101..104, FC-201..203,
// FC-301..304, FC-403, FC-801/802 — новый контент под специфику ниши.

const {
  personnelReportingQuestion,
  laborMisrepresentationQuestion,
  ofertaQuestion,
  marketingConsentQuestion,
  premisesOperationQuestions,
  financialSecurityQuestions,
} = require('../sharedQuestionBlocks');

const QUESTIONS = [
  // --- Блок 1. Юридическая база (всегда) ---
  {
    code: 'FC-101',
    block: 1,
    text: 'Подтверждено ли документами на помещение (договором аренды или сведениями ЕГРН), что использование под офис/склад снаряжения допускается?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FC-102',
    block: 1,
    text: 'Подано ли уведомление о начале деятельности в Роспотребнадзор?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FC-103',
    block: 1,
    text: 'Подключён ли эквайринг (приём оплаты картой), если ваша выручка обязывает его иметь?',
    hint: 'Не относится к ИП/самозанятым с выручкой менее 5 млн ₽/год или без доступа к интернету.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FC-104',
    block: 1,
    text: 'Размещена ли в офисе обязательная информация для потребителей («уголок потребителя»)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 2. Организация работ на высоте (всегда) ---
  {
    code: 'FC-201',
    block: 2,
    text: 'Оформляется ли наряд-допуск на каждую работу на высоте до её начала?',
    hint: 'Самый значимый юридический и практический риск ниши.',
    showIf: null,
    answers: [
      { label: 'Да, всегда', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FC-202',
    block: 2,
    text: 'Имеют ли все сотрудники, выполняющие работы на высоте, соответствующую группу допуска и удостоверение?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не у всех', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FC-203',
    block: 2,
    text: 'Ограждается ли опасная зона внизу (тротуар, проезд) во время работ на фасаде?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да, всегда', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 3. Оборудование и снаряжение (всегда) ---
  {
    code: 'FC-301',
    block: 3,
    text: 'Есть ли сертификаты/декларации соответствия на страховочное снаряжение (системы, верёвки, карабины)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FC-302',
    block: 3,
    text: 'Есть ли инструкции/паспорта на русском языке на используемое снаряжение?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FC-303',
    block: 3,
    text: 'Ведётся ли журнал учёта снаряжения со сроками эксплуатации и плановой заменой?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FC-304',
    block: 3,
    text: 'Обеспечен ли персонал полным комплектом СИЗ для работы на высоте (каска, страховочная привязь, спецодежда)?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 4. Персонал (показывается только при наличии сотрудников) ---
  {
    code: 'FC-501',
    block: 4,
    text: 'Проводилась ли специальная оценка условий труда?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  laborMisrepresentationQuestion('FC', { workerNoun: 'промышленные альпинисты' }),
  {
    code: 'FC-503',
    block: 4,
    text: 'Проходят ли сотрудники обязательные предварительные и периодические медицинские осмотры для работы на высоте?',
    hint: 'Прямо предусмотрено для работ на высоте — подтверждённое, не предполагаемое требование.',
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FC-504',
    block: 4,
    text: 'Ведётся ли журнал инструктажа сотрудников, включая работу на высоте и порядок наряда-допуска?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  personnelReportingQuestion('FC'),

  // --- Блок 5. Персональные данные и документы для заказчиков (всегда) ---
  {
    code: 'FC-401',
    block: 5,
    text: 'Подано ли уведомление о деятельности в качестве оператора персональных данных?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FC-402',
    block: 5,
    text: 'Размещена ли политика конфиденциальности?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FC-403',
    block: 5,
    text: 'Оформляются ли письменные согласия заказчиков-физлиц на обработку персональных данных?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ofertaQuestion('FC'),
  marketingConsentQuestion('FC', '406'),

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  ...premisesOperationQuestions('FC'),

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'FC-701',
    block: 7,
    text: 'Зарегистрирован ли товарный знак или бренд компании?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Планирую', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FC-702',
    block: 7,
    text: 'Заключаются ли письменные договоры с подрядчиками (субподрядные бригады, поставщики снаряжения)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не со всеми', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FC-801',
    block: 8,
    text: 'Предупреждаете ли заказчика заранее о возможном переносе работ по погоде и об ограничениях результата при сильных загрязнениях?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Иногда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FC-802',
    block: 8,
    text: 'Оформлено ли добровольное страхование гражданской ответственности перед третьими лицами?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Рассматриваю', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  // --- Блок 9. Финансовая безопасность (риск блокировки счёта, 115-ФЗ, 01.09.2026) ---
  ...financialSecurityQuestions('FC'),
];

const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'facade_cleaning', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
