// Платный аудит, ниша "Ателье (пошив и ремонт одежды)". Блоки 4 (кроме
// ATL-501/504), 5 (кроме ATL-403/404), 6, 9 идентичны остальным нишам
// бытовых/сервисных услуг (см. violations/atelier.js — та же нормативная
// база и штрафы). ATL-105, ATL-201..203, ATL-301..304, ATL-403/404, ATL-701/
// 702, ATL-801 — новый контент под специфику ателье, см. комментарий в
// шапке violations/atelier.js про источники.

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
    code: 'ATL-101',
    block: 1,
    text: 'Подтверждено ли документами на помещение (договором аренды — если арендуете, или сведениями ЕГРН/техпаспорта о разрешённом использовании — если помещение в собственности), что оно используется под ателье?',
    hint: 'Если помещение в собственности: смотрите не на договор аренды (его не будет), а на то, что помещение нежилое и его разрешённое использование по документам это допускает.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ...legalBasisCoreQuestions('ATL'),
  {
    code: 'ATL-105',
    block: 1,
    text: 'Оформляется ли при приёме вещи или ткани клиента в работу приёмная квитанция с описанием состояния, дефектов и комплектности?',
    hint: 'При споре о порче/утрате вещи без этой квитанции сложно доказать, что дефект уже был на момент приёма.',
    showIf: null,
    answers: [
      { label: 'Да, всегда', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 2. Санитарная безопасность помещения (всегда) ---
  {
    code: 'ATL-201',
    block: 2,
    text: 'Работает ли в мастерской приточно-вытяжная вентиляция и обслуживается ли она регулярно?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет / не обслуживается', points: 0 },
    ],
  },
  {
    code: 'ATL-202',
    block: 2,
    text: 'Ведётся ли журнал учёта уборки, и убираются ли текстильная пыль и обрезки ткани с рабочих зон ежедневно?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Убираем, но журнал не ведём', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'ATL-203',
    block: 2,
    text: 'Обеспечены ли сотрудники на раскрое и глажке/отпаривании необходимыми средствами защиты и проинструктированы ли о безопасной работе с нагревательным оборудованием?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 3. Оборудование (всегда) ---
  {
    code: 'ATL-301',
    block: 3,
    text: 'Есть ли сертификаты/декларации соответствия на швейные машины, оверлоки, утюги, парогенераторы и прессы?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'ATL-302',
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
    code: 'ATL-303',
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
    code: 'ATL-304',
    block: 3,
    text: 'Действует ли у вас правило не оставлять включённые утюги/парогенераторы/прессы без присмотра и проверять исправность шнуров?',
    hint: 'Прямой источник пожара в помещении, где рядом постоянно лежит ткань.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда соблюдается', points: 0.5 },
      { label: 'Нет такого правила', points: 0 },
    ],
  },

  // --- Блок 4. Персонал (показывается только при наличии сотрудников,
  // кроме ATL-504) ---
  {
    code: 'ATL-501',
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
  laborMisrepresentationQuestion('ATL', { workerNoun: 'швеи и закройщики' }),
  medicalBooksQuestion('ATL'),
  {
    code: 'ATL-504',
    block: 4,
    text: 'Ведётся ли журнал инструктажа сотрудников, включая безопасную работу с иглами машин и нагревательным оборудованием?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  personnelReportingQuestion('ATL'),

  // --- Блок 5. Персональные данные (всегда) ---
  ...personalDataCoreQuestions('ATL'),
  {
    code: 'ATL-403',
    block: 5,
    text: 'Оформляются ли письменные согласия клиентов на обработку персональных данных, включая мерки и параметры фигуры?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'ATL-404',
    block: 5,
    text: 'Берёте ли письменное согласие клиента перед публикацией фото/видео готовых изделий (особенно если на фото сам клиент)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Иногда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ofertaQuestion('ATL'),
  marketingConsentQuestion('ATL', '406'),

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  ...premisesOperationQuestions('ATL'),

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'ATL-701',
    block: 7,
    text: 'Зарегистрирован ли товарный знак или бренд ателье?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Планирую', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'ATL-702',
    block: 7,
    text: 'Заключаются ли письменные договоры с поставщиками тканей/фурнитуры и подрядчиками?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не со всеми', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'ATL-801',
    block: 8,
    text: 'Предупреждаете ли клиента письменно о рисках работы с конкретной тканью (усадка, состояние на момент приёма, ограничения при восстановлении исходного вида)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Только устно', points: 0 },
      { label: 'Нет', points: 0 },
    ],
  },
  // --- Блок 9. Финансовая безопасность (риск блокировки счёта, 115-ФЗ, 01.09.2026) ---
  ...financialSecurityQuestions('ATL'),
];

const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'atelier', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
