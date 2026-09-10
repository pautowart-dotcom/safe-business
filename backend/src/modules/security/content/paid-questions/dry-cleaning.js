// Платный аудит, ниша "Химчистка". Блоки 1 (кроме DC-101/105), 4 (кроме
// DC-501/504), 5 (кроме DC-403/404), 6, 9 идентичны остальным нишам
// бытовых/сервисных услуг (см. violations/dry-cleaning.js — та же
// нормативная база и штрафы). DC-105, DC-201..206, DC-301..303, DC-403/404,
// DC-701..703, DC-801 — новый контент под специфику химчистки, см.
// комментарий в шапке violations/dry-cleaning.js про источники, включая
// точные цитаты пунктов Приказа Минтруда №834н.

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
    code: 'DC-101',
    block: 1,
    text: 'Подтверждено ли документами на помещение (договором аренды — если арендуете, или сведениями ЕГРН/техпаспорта о разрешённом использовании — если помещение в собственности), что оно используется под химчистку?',
    hint: 'Если помещение в собственности: смотрите не на договор аренды (его не будет), а на то, что помещение нежилое и его разрешённое использование по документам это допускает.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ...legalBasisCoreQuestions('DC'),
  {
    code: 'DC-105',
    block: 1,
    text: 'Оформляется ли при приёме вещи в химчистку приёмная квитанция с описанием состояния, дефектов и комплектности?',
    hint: 'При споре о порче/утрате вещи без этой квитанции сложно доказать, что дефект уже был на момент приёма — особенно важно для меховых и кожаных изделий.',
    showIf: null,
    answers: [
      { label: 'Да, всегда', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 2. Безопасность при работе с растворителями (всегда) ---
  {
    code: 'DC-201',
    block: 2,
    text: 'Запускаются ли машины химчистки и выгружаются ли изделия только при работающей приточно-вытяжной вентиляции?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да, всегда', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет / вентиляция не проверяется', points: 0 },
    ],
  },
  {
    code: 'DC-202',
    block: 2,
    text: 'Заправляются ли машины растворителем через насосы по трубопроводам, а не вручную вёдрами?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Вручную', points: 0 },
    ],
  },
  {
    code: 'DC-203',
    block: 2,
    text: 'Хранятся ли химикаты в металлическом шкафу, а реактивы для пятновыведения — в таре с капельницами-дозаторами?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'DC-204',
    block: 2,
    text: 'Есть ли письменная инструкция и проведён ли инструктаж на случай утечки растворителя?',
    hint: 'Ключевое действие — немедленное включение всех систем вентиляции.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Нет письменной инструкции, но персонал в курсе', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'DC-205',
    block: 2,
    text: 'Действует ли правило не оставлять работающее оборудование химчистки без присмотра?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда соблюдается', points: 0.5 },
      { label: 'Нет такого правила', points: 0 },
    ],
  },
  {
    code: 'DC-206',
    block: 2,
    text: 'Обеспечены ли сотрудники, работающие с химикатами, резиновыми перчатками и защитными очками?',
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
    code: 'DC-301',
    block: 3,
    text: 'Есть ли сертификаты/декларации соответствия на машины химической чистки?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'DC-302',
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
    code: 'DC-303',
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

  // --- Блок 4. Персонал (показывается только при наличии сотрудников,
  // кроме DC-501/504) ---
  {
    code: 'DC-501',
    block: 4,
    text: 'Проводилась ли специальная оценка условий труда?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  laborMisrepresentationQuestion('DC', { workerNoun: 'сотрудники химчистки' }),
  medicalBooksQuestion('DC'),
  {
    code: 'DC-504',
    block: 4,
    text: 'Проводится ли инструктаж по охране труда, включая работу с растворителями, заправку и хранение химикатов?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  personnelReportingQuestion('DC'),

  // --- Блок 5. Персональные данные (всегда) ---
  ...personalDataCoreQuestions('DC'),
  {
    code: 'DC-403',
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
    code: 'DC-404',
    block: 5,
    text: 'Берёте ли письменное согласие клиента перед публикацией фото/видео результата чистки?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Иногда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ofertaQuestion('DC'),
  marketingConsentQuestion('DC', '406'),

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  ...premisesOperationQuestions('DC'),

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'DC-701',
    block: 7,
    text: 'Оформлен ли паспорт отхода на отработанный растворитель/фильтры и заключён ли договор со специализированной лицензированной организацией на их вывоз?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Договор есть, паспорт отхода не оформляли', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'DC-702',
    block: 7,
    text: 'Зарегистрирован ли товарный знак или бренд химчистки?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Планирую', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'DC-703',
    block: 7,
    text: 'Заключаются ли письменные договоры с поставщиками химикатов и подрядчиками?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не со всеми', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'DC-801',
    block: 8,
    text: 'Предупреждаете ли клиента письменно о рисках химчистки конкретной вещи (пятно может не вывестись, риск усадки/потери цвета)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Только устно', points: 0 },
      { label: 'Нет', points: 0 },
    ],
  },
  // --- Блок 9. Финансовая безопасность (риск блокировки счёта, 115-ФЗ, 01.09.2026) ---
  ...financialSecurityQuestions('DC'),
];

const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'dry_cleaning', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
