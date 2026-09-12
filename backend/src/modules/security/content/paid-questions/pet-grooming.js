// Платный аудит, ниша "Груминг для животных". Блоки 1 (кроме GR-101/105),
// 4 (кроме GR-501/504), 5 (кроме GR-403/404), 6, 9 идентичны остальным
// нишам бытовых/сервисных услуг (см. violations/pet-grooming.js — та же
// нормативная база и штрафы). GR-105, GR-201..204, GR-301..303, GR-403/404,
// GR-701/702, GR-801 — новый контент под специфику груминга, см. комментарий
// в шапке violations/pet-grooming.js про источники.

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
    code: 'GR-101',
    block: 1,
    text: 'Подтверждено ли документами на помещение (договором аренды — если арендуете, или сведениями ЕГРН/техпаспорта о разрешённом использовании — если помещение в собственности), что оно используется под груминг-салон?',
    hint: 'Если помещение в собственности: смотрите не на договор аренды (его не будет), а на то, что помещение нежилое и его разрешённое использование по документам это допускает.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ...legalBasisCoreQuestions('GR'),
  {
    code: 'GR-105',
    block: 1,
    text: 'Заполняется ли при приёме животного анкета о здоровье, вакцинации и поведенческих особенностях?',
    hint: 'Защищает и мастера (риск агрессии), и вас в споре о состоянии животного после услуги.',
    showIf: null,
    answers: [
      { label: 'Да, всегда', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 2. Санитарная безопасность и работа с животными (всегда) ---
  {
    code: 'GR-201',
    block: 2,
    text: 'Работает ли в салоне приточно-вытяжная вентиляция и обслуживается ли она регулярно?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет / не обслуживается', points: 0 },
    ],
  },
  {
    code: 'GR-202',
    block: 2,
    text: 'Дезинфицируются ли инструменты (машинки, ножницы, когтерезы) и стол после каждого животного?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да, всегда', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'GR-203',
    block: 2,
    text: 'Ведётся ли журнал уборки, и оборудован ли сток в зоне мытья животных трапом для задержки шерсти?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да, и то и другое', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'GR-204',
    block: 2,
    text: 'Есть ли установленный порядок действий на случай ухудшения состояния животного во время услуги?',
    hint: 'Контакты ближайшей ветклиники, правило "сначала прекратить услугу".',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Персонал в курсе, но не записано', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 3. Оборудование (всегда) ---
  {
    code: 'GR-301',
    block: 3,
    text: 'Есть ли сертификаты/декларации соответствия на машинки, фены и другое оборудование?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'GR-302',
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
    code: 'GR-303',
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
  // кроме GR-504) ---
  {
    code: 'GR-501',
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
  laborMisrepresentationQuestion('GR', { workerNoun: 'грумеры' }),
  medicalBooksQuestion('GR'),
  {
    code: 'GR-504',
    block: 4,
    text: 'Проводится ли инструктаж по безопасному обращению с животными (фиксация, распознавание агрессии) и режущим инструментом?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  personnelReportingQuestion('GR'),

  // --- Блок 5. Персональные данные (всегда) ---
  ...personalDataCoreQuestions('GR'),
  {
    code: 'GR-403',
    block: 5,
    text: 'Оформляются ли письменные согласия владельцев на обработку персональных данных при записи?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'GR-404',
    block: 5,
    text: 'Берёте ли письменное согласие владельца перед публикацией фото/видео питомца до/после?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Иногда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ofertaQuestion('GR'),
  marketingConsentQuestion('GR', '406'),

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  ...premisesOperationQuestions('GR'),

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'GR-701',
    block: 7,
    text: 'Зарегистрирован ли товарный знак или бренд салона?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Планирую', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'GR-702',
    block: 7,
    text: 'Заключаются ли письменные договоры с подрядчиками (аренда мест, поставщики расходников)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не со всеми', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'GR-801',
    block: 8,
    text: 'Предупреждаете ли владельца письменно об ограничениях результата (колтуны под кожу, поддержание породной стрижки)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Только устно', points: 0 },
      { label: 'Нет', points: 0 },
    ],
  },
  // --- Блок 9. Финансовая безопасность (риск блокировки счёта, 115-ФЗ, 01.09.2026) ---
  ...financialSecurityQuestions('GR'),
];

const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'pet_grooming', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
