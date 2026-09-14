// Платный аудит, ниша "Ремонт часов и ювелирных изделий". Блоки 4 (кроме
// WJ-501/504), 5 (кроме WJ-403/404), 6, 9 идентичны остальным нишам бытовых
// услуг (см. violations/watch-jewelry-repair.js). WJ-105..107, WJ-201/202,
// WJ-301..304, WJ-403/404, WJ-701/702, WJ-801 — новый контент под специфику
// ниши, источники — см. комментарий в шапке violations/watch-jewelry-repair.js.

const {
  personnelReportingQuestion,
  legalBasisCoreQuestions,
  laborMisrepresentationQuestion,
  medicalBooksQuestion,
  personalDataCoreQuestions,
  ofertaQuestion,
  marketingConsentQuestion,
  premisesOperationQuestions,
  financialSecurityQuestions,
} = require('../sharedQuestionBlocks');

const QUESTIONS = [
  // --- Блок 1. Юридическая база (всегда) ---
  {
    code: 'WJ-101',
    block: 1,
    text: 'Подтверждено ли документами на помещение (договором аренды — если арендуете, или сведениями ЕГРН/техпаспорта о разрешённом использовании — если помещение в собственности), что оно используется под мастерскую?',
    hint: 'Если помещение в собственности: смотрите не на договор аренды (его не будет), а на то, что помещение нежилое и его разрешённое использование по документам это допускает.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ...legalBasisCoreQuestions('WJ'),
  {
    code: 'WJ-105',
    block: 1,
    text: 'Оформляется ли при приёме изделия подробная квитанция (материал, проба, вес, характеристики камней, дефекты) с фотофиксацией?',
    hint: 'При споре о подмене камня или изменении веса металла без этого практически невозможно доказать исходное состояние.',
    showIf: null,
    answers: [
      { label: 'Да, всегда', points: 1 },
      { label: 'Не всегда / не всё фиксируем', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'WJ-106',
    block: 1,
    text: 'Согласовываете ли срок ремонта письменно (не более 45 дней без отдельного согласия) и фиксируете ли гарантию на работу и детали?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'WJ-107',
    block: 1,
    text: 'Уточняли ли вы (у юриста или в Пробирной палате), нужен ли вашей мастерской специальный учёт и регистрация в ГИИС ДМДК?',
    hint: 'Закон существует и упоминает "ремонтные мастерские" среди участников — точная граница применения к вашей ситуации требует индивидуальной проверки.',
    showIf: null,
    answers: [
      { label: 'Да, уточнял(а), знаю ответ', points: 1 },
      { label: 'Слышал(а), но не проверял(а)', points: 0.5 },
      { label: 'Нет, не слышал(а) об этом', points: 0 },
    ],
  },

  // --- Блок 2. Санитарная безопасность и работа с изделиями (всегда) ---
  {
    code: 'WJ-201',
    block: 2,
    text: 'Оборудовано ли рабочее место пайки и полировки местной вытяжной вентиляцией?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'WJ-202',
    block: 2,
    text: 'Хранятся ли флюсы, кислоты и полировальные пасты в герметичной промаркированной таре, отдельно от рабочих мест?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 3. Оборудование (всегда) ---
  {
    code: 'WJ-301',
    block: 3,
    text: 'Есть ли сертификаты/декларации соответствия на паяльное, полировальное и ультразвуковое оборудование?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'WJ-302',
    block: 3,
    text: 'Есть ли инструкции на русском языке на используемое оборудование?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'WJ-303',
    block: 3,
    text: 'Оформлены ли документы ввода оборудования в эксплуатацию?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'WJ-304',
    block: 3,
    text: 'Если вы взвешиваете металл клиента — проходят ли весы периодическую поверку?',
    hint: 'Неприменимо, если работа ведётся без снятия/взвешивания металла.',
    showIf: null,
    answers: [
      { label: 'Да, весы поверены', points: 1 },
      { label: 'Не уверен(а)', points: 0.5 },
      { label: 'Нет / не применимо', points: 0 },
    ],
  },

  // --- Блок 4. Персонал (показывается только при наличии сотрудников,
  // кроме WJ-504) ---
  {
    code: 'WJ-501',
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
  laborMisrepresentationQuestion('WJ', { workerNoun: 'мастера-ремонтники' }),
  medicalBooksQuestion('WJ'),
  {
    code: 'WJ-504',
    block: 4,
    text: 'Ведётся ли журнал инструктажа сотрудников, включая работу с паяльным оборудованием и химикатами?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  personnelReportingQuestion('WJ'),

  // --- Блок 5. Персональные данные (всегда) ---
  ...personalDataCoreQuestions('WJ'),
  {
    code: 'WJ-403',
    block: 5,
    text: 'Оформляются ли письменные согласия клиентов на обработку персональных данных при оформлении заказа?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'WJ-404',
    block: 5,
    text: 'Берёте ли письменное согласие клиента перед публикацией фото/видео изделия?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Иногда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ofertaQuestion('WJ'),
  marketingConsentQuestion('WJ', '406'),

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  ...premisesOperationQuestions('WJ'),

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'WJ-701',
    block: 7,
    text: 'Зарегистрирован ли товарный знак или бренд мастерской?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Планирую', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'WJ-702',
    block: 7,
    text: 'Заключаются ли письменные договоры с поставщиками запчастей и подрядчиками?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не со всеми', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'WJ-801',
    block: 8,
    text: 'Предупреждаете ли клиента письменно о необратимых рисках конкретной операции (хрупкость камня, редкость деталей)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Только устно', points: 0 },
      { label: 'Нет', points: 0 },
    ],
  },
  // --- Блок 9. Финансовая безопасность (риск блокировки счёта, 115-ФЗ, 01.09.2026) ---
  ...financialSecurityQuestions('WJ'),
];

const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'watch_jewelry_repair', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
