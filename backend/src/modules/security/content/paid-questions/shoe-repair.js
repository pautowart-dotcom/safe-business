// Платный аудит, ниша "Ремонт обуви". Блоки 4 (кроме SR-501/504), 5 (кроме
// SR-403/404), 6, 9 идентичны остальным нишам бытовых/сервисных услуг (см.
// violations/shoe-repair.js — та же нормативная база и штрафы). SR-105,
// SR-201..203, SR-301..304, SR-403/404, SR-701/702, SR-801 — новый контент
// под специфику ремонта обуви, см. комментарий в шапке violations/shoe-repair.js.

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
    code: 'SR-101',
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
  ...legalBasisCoreQuestions('SR'),
  {
    code: 'SR-105',
    block: 1,
    text: 'Оформляется ли при приёме обуви или изделия из кожи в работу приёмная квитанция с описанием состояния, дефектов и комплектности?',
    hint: 'При споре о порче/утрате изделия без этой квитанции сложно доказать, что дефект уже был на момент приёма.',
    showIf: null,
    answers: [
      { label: 'Да, всегда', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 2. Санитарная безопасность и работа с клеями/растворителями
  // (всегда) ---
  {
    code: 'SR-201',
    block: 2,
    text: 'Работает ли в мастерской вытяжная вентиляция у мест шлифовки/фрезеровки и работы с клеями/растворителями?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет / не обслуживается', points: 0 },
    ],
  },
  {
    code: 'SR-202',
    block: 2,
    text: 'Хранятся ли клеи и растворители в герметичной промаркированной таре, отдельно от рабочих мест?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'SR-203',
    block: 2,
    text: 'Запрещены ли курение и открытый огонь у рабочих мест, где используются клеи и растворители?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да, запрещено и соблюдается', points: 1 },
      { label: 'Правило есть, но не всегда соблюдается', points: 0.5 },
      { label: 'Нет такого правила', points: 0 },
    ],
  },

  // --- Блок 3. Оборудование (всегда) ---
  {
    code: 'SR-301',
    block: 3,
    text: 'Есть ли сертификаты/декларации соответствия на швейно-затяжные, шлифовальные, фрезеровальные машины и прессы?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'SR-302',
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
    code: 'SR-303',
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
    code: 'SR-304',
    block: 3,
    text: 'Обеспечены ли сотрудники на шлифовке и работе с клеями средствами защиты (респиратор/маска, перчатки, очки)?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 4. Персонал (показывается только при наличии сотрудников,
  // кроме SR-504) ---
  {
    code: 'SR-501',
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
  laborMisrepresentationQuestion('SR', { workerNoun: 'обувщики' }),
  medicalBooksQuestion('SR'),
  {
    code: 'SR-504',
    block: 4,
    text: 'Ведётся ли журнал инструктажа сотрудников, включая безопасную работу с режущим инструментом, станками и клеями/растворителями?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  personnelReportingQuestion('SR'),

  // --- Блок 5. Персональные данные (всегда) ---
  ...personalDataCoreQuestions('SR'),
  {
    code: 'SR-403',
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
    code: 'SR-404',
    block: 5,
    text: 'Берёте ли письменное согласие клиента перед публикацией фото/видео результата ремонта?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Иногда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ofertaQuestion('SR'),
  marketingConsentQuestion('SR', '406'),

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  ...premisesOperationQuestions('SR'),

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'SR-701',
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
    code: 'SR-702',
    block: 7,
    text: 'Заключаются ли письменные договоры с поставщиками материалов и подрядчиками?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не со всеми', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'SR-801',
    block: 8,
    text: 'Предупреждаете ли клиента письменно о рисках ремонта конкретного изделия (степень износа, ограничения по совпадению цвета)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Только устно', points: 0 },
      { label: 'Нет', points: 0 },
    ],
  },
  // --- Блок 9. Финансовая безопасность (риск блокировки счёта, 115-ФЗ, 01.09.2026) ---
  ...financialSecurityQuestions('SR'),
];

const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'shoe_repair', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
