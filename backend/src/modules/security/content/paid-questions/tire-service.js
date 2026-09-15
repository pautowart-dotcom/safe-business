// Платный аудит, ниша "Шиномонтаж" — вторая ниша сегмента "Услуги для
// автомобилей". Блоки 4 (кроме TS-501/504/506), 5 (кроме TS-403/404), 6, 9
// идентичны остальным нишам бытовых/сервисных услуг (см.
// violations/tire-service.js — та же нормативная база и штрафы). TS-101/105,
// TS-201/202, TS-301..304, TS-403/404, TS-506, TS-701/702, TS-801 — новый
// контент под специфику ниши, источники — см. комментарий в шапке
// violations/tire-service.js.

const {
  personnelReportingQuestion,
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
    code: 'TS-101',
    block: 1,
    text: 'Подтверждено ли документами на помещение (договором аренды или сведениями ЕГРН), что использование под шиномонтаж допускается?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'TS-102',
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
    code: 'TS-103',
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
    code: 'TS-104',
    block: 1,
    text: 'Размещена ли на видном месте обязательная информация для потребителей («уголок потребителя»)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'TS-105',
    block: 1,
    text: 'Осматриваются ли колёса/диски при приёме на предмет уже имеющихся повреждений?',
    hint: 'Защищает от необоснованных претензий о повреждениях, возникших до начала работ.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Иногда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 2. Обращение с отработанными шинами (всегда) ---
  {
    code: 'TS-201',
    block: 2,
    text: 'Заключён ли договор с организацией, имеющей лицензию на утилизацию отходов IV класса опасности, на вывоз отработанных шин?',
    hint: 'Отработанные шины нельзя вывозить на обычную свалку/полигон ТКО — это самый значимый риск ниши.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'TS-202',
    block: 2,
    text: 'Соблюдаются ли противопожарные требования при хранении отработанных шин до вывоза (расстояние от стен/светильников, не рядом с горючими жидкостями и газовыми баллонами)?',
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
    code: 'TS-301',
    block: 3,
    text: 'Есть ли сертификаты/декларации соответствия на оборудование (шиномонтажный станок, балансировочный станок, подъёмник, компрессор)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'TS-302',
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
    code: 'TS-303',
    block: 3,
    text: 'Оформлены ли акты ввода в эксплуатацию подъёмника и станков, проводится ли их периодическое техническое освидетельствование?',
    hint: 'Для типового легкового подъёмника (без пассажиров, высота подъёма менее 6 м) регистрация в Ростехнадзоре не требуется — но акт ввода и освидетельствование по паспорту изготовителя нужны в любом случае.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'TS-304',
    block: 3,
    text: 'Обеспечен ли персонал средствами индивидуальной защиты (перчатки, защита органов слуха и от вибрации при работе с пневмоинструментом)?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 4. Персонал (показывается только при наличии сотрудников,
  // кроме TS-504) ---
  {
    code: 'TS-501',
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
  laborMisrepresentationQuestion('TS', { workerNoun: 'шиномонтажники' }),
  medicalBooksQuestion('TS'),
  {
    code: 'TS-504',
    block: 4,
    text: 'Ведётся ли журнал инструктажа сотрудников, включая работу с подъёмником, пневмоинструментом и станками?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  personnelReportingQuestion('TS'),
  {
    code: 'TS-506',
    block: 4,
    text: 'Если по итогам СОУТ рабочее место отнесено к вредному классу по вибрации/шуму — проходят ли сотрудники обязательные периодические медосмотры?',
    hint: 'Применимо только если СОУТ показала вредный класс по этим факторам — сначала нужен результат СОУТ.',
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Вредный класс не выявлен / неприменимо', points: 1 },
      { label: 'Нет, хотя выявлен', points: 0 },
    ],
  },

  // --- Блок 5. Персональные данные (всегда) ---
  ...personalDataCoreQuestions('TS'),
  {
    code: 'TS-403',
    block: 5,
    text: 'Оформляются ли письменные согласия клиентов на обработку персональных данных?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'TS-404',
    block: 5,
    text: 'Берёте ли письменное согласие клиента перед публикацией фото/видео автомобиля (с номерным знаком)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Иногда / размываем номер', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ofertaQuestion('TS'),
  marketingConsentQuestion('TS', '406'),

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  ...premisesOperationQuestions('TS'),

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'TS-701',
    block: 7,
    text: 'Зарегистрирован ли товарный знак или бренд шиномонтажа?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Планирую', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'TS-702',
    block: 7,
    text: 'Заключаются ли письменные договоры с подрядчиками (вывоз шин, обслуживание оборудования)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не со всеми', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'TS-801',
    block: 8,
    text: 'Предупреждаете ли клиента заранее об объективных рисках (ржавый крепёж, старая резина, TPMS-датчики), не зависящих от качества работы мастера?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Только в явных случаях', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  // --- Блок 9. Финансовая безопасность (риск блокировки счёта, 115-ФЗ, 01.09.2026) ---
  ...financialSecurityQuestions('TS'),
];

const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'tire_service', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
