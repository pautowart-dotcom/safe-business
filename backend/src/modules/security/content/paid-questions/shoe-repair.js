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
    text: 'Разрешено ли по документам работать в вашем помещении?',
    hint: 'Если арендуете — посмотрите в договоре аренды, для чего сдаётся помещение: подойдёт «оказание услуг», «бытовые услуги», «коммерческое использование». Если помещение ваше — по выписке ЕГРН или техпаспорту оно должно быть нежилым и подходить под вашу деятельность.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не знаю', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ...legalBasisCoreQuestions('SR', { notificationActivity: 'ремонта обуви' }),
  {
    code: 'SR-105',
    block: 1,
    text: 'Выдаёте ли клиенту квитанцию, когда принимаете обувь?',
    hint: 'В квитанции — описание изделия, состояние, дефекты, комплектность и цена. Без неё в споре сложно доказать, что дефект уже был. Бланк есть в «Документах».',
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
    text: 'Есть ли вытяжка у мест шлифовки и работы с клеем?',
    hint: 'Местная вытяжная вентиляция там, где шлифуют, фрезеруют и работают с клеями и растворителями.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет или не обслуживается', points: 0 },
    ],
  },
  {
    code: 'SR-202',
    block: 2,
    text: 'Храните ли клеи и растворители в закрытой подписанной таре отдельно от рабочих мест?',
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
    text: 'Запрещено ли курить и пользоваться огнём рядом с клеями и растворителями?',
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
    text: 'Есть ли сертификаты или декларации на швейно-затяжные, шлифовальные, фрезеровальные машины и прессы?',
    hint: 'Обычно документы даёт поставщик; декларацию можно найти бесплатно по названию товара в реестре Росаккредитации (pub.fsa.gov.ru).',
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
    text: 'Есть ли инструкции к оборудованию на русском языке?',
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
    text: 'Составлен ли акт ввода оборудования в работу?',
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
    text: 'Есть ли у сотрудников респираторы, перчатки и очки для шлифовки и клеев?',
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
    text: 'Проводили ли специальную оценку условий труда (СОУТ)?',
    hint: 'Её делает аккредитованная организация: оценивает каждое рабочее место и выдаёт отчёт. Нужна, если есть работники по трудовому договору.',
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
    text: 'Проводите ли инструктажи сотрудников по охране труда и записываете ли их?',
    hint: 'Включая работу с режущим инструментом, станками, клеями. Вводный — при приёме, первичный — до начала работы, повторный — не реже раза в полгода. В записи: дата, ФИО и дата рождения, подписи.',
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
    text: 'Подписывают ли клиенты согласие на обработку персональных данных?',
    hint: 'Персональные данные — имя, телефон, история визитов.',
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
    text: 'Берёте ли письменное согласие клиента, прежде чем выложить фото или видео?',
    hint: 'Например, перед публикацией в соцсетях.',
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
    text: 'Зарегистрировано ли ваше название как товарный знак?',
    hint: 'Без регистрации такое же название может зарегистрировать другой человек и потребовать, чтобы вы его сменили.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Планирую', points: 0.5 },
      { label: 'Нет', points: 0 },
      { label: 'Точка франшизы — знак зарегистрирован у франшизы', points: 1 },
    ],
  },
  {
    code: 'SR-702',
    block: 7,
    text: 'Есть ли письменные договоры с поставщиками и подрядчиками?',
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
    text: 'Предупреждаете ли клиента письменно о рисках ремонта его обуви?',
    hint: 'Износ материала, цвет при перекраске может не совпасть. Если клиент письменно предупреждён об особых свойствах вещи, вы не отвечаете за порчу именно из-за них (п. 3 ст. 35 Закона о защите прав потребителей). Бланк есть в «Документах».',
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
