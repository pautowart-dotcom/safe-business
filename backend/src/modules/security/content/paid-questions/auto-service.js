// Платный аудит, ниша "Автосервис" — третья ниша сегмента "Услуги для
// автомобилей". Блоки 4 (кроме AS-501/504/506), 6, 9 идентичны остальным
// нишам бытовых/сервисных услуг (см. violations/auto-service.js — та же
// нормативная база и штрафы). AS-101/102/103/104 (те же формулировки, что у
// tire_service), AS-201/202, AS-301..304, AS-403/404, AS-405/406/407
// (заказ-наряд по ПП №780 — НЕ через общий ofertaQuestion, см. комментарий в
// шапке violations/auto-service.js), AS-506, AS-701/702, AS-801 — новый
// контент под специфику ниши.

const {
  personnelReportingQuestion,
  laborMisrepresentationQuestion,
  medicalBooksQuestion,
  personalDataCoreQuestions,
  marketingConsentQuestion,
  premisesOperationQuestions,
  financialSecurityQuestions,
} = require('../sharedQuestionBlocks');

const QUESTIONS = [
  // --- Блок 1. Юридическая база (всегда) ---
  {
    code: 'AS-101',
    block: 1,
    text: 'Подтверждено ли документами на помещение (договором аренды или сведениями ЕГРН), что использование под автосервис допускается?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'AS-102',
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
    code: 'AS-103',
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
    code: 'AS-104',
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

  // --- Блок 2. Обращение с отработанным маслом (всегда) ---
  {
    code: 'AS-201',
    block: 2,
    text: 'Заключён ли договор с организацией, имеющей лицензию на утилизацию отходов III класса опасности, на вывоз отработанного масла?',
    hint: 'Слив масла в канализацию или на грунт запрещён — это самый значимый риск ниши.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'AS-202',
    block: 2,
    text: 'Хранится ли отработанное масло в герметичной промаркированной ёмкости, а промасленная ветошь/фильтры — отдельно от обычного мусора?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'AS-203',
    block: 2,
    text: 'Передаётся ли отработанный антифриз/тосол лицензированной организации, отдельно от масла?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 3. Оборудование (всегда) ---
  {
    code: 'AS-301',
    block: 3,
    text: 'Есть ли сертификаты/декларации соответствия на оборудование (подъёмник, диагностическое оборудование, компрессор)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'AS-302',
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
    code: 'AS-303',
    block: 3,
    text: 'Оформлен ли акт ввода в эксплуатацию подъёмника, проводится ли его периодическое техническое освидетельствование?',
    hint: 'Для типового легкового подъёмника (без пассажиров, высота подъёма менее 6 м) регистрация в Ростехнадзоре не требуется — но акт ввода и освидетельствование по паспорту изготовителя нужны в любом случае.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'AS-304',
    block: 3,
    text: 'Обеспечен ли персонал средствами индивидуальной защиты (спецодежда, перчатки, защита органов слуха и от вибрации)?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 4. Персонал (показывается только при наличии сотрудников,
  // кроме AS-504) ---
  {
    code: 'AS-501',
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
  laborMisrepresentationQuestion('AS', { workerNoun: 'автомеханики' }),
  medicalBooksQuestion('AS'),
  {
    code: 'AS-504',
    block: 4,
    text: 'Ведётся ли журнал инструктажа сотрудников, включая работу с подъёмником, пневмоинструментом и маслами?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  personnelReportingQuestion('AS'),
  {
    code: 'AS-506',
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

  // --- Блок 5. Персональные данные и документы по ПП №780 (всегда) ---
  ...personalDataCoreQuestions('AS'),
  {
    code: 'AS-403',
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
    code: 'AS-404',
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
  {
    code: 'AS-405',
    block: 5,
    text: 'Оформляете ли вы заказ-наряд на каждую услугу (перечень работ, цены, гарантийные сроки) и выдаёте ли клиенту экземпляр?',
    hint: 'Обязательная письменная форма договора по Постановлению Правительства РФ №780 от 29.05.2025.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'AS-406',
    block: 5,
    text: 'Уведомляете ли клиента, что гарантия распространяется на работу, а не на саму запчасть (если не оговорено иное)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'AS-407',
    block: 5,
    text: 'Предлагаете ли клиенту вернуть заменённые детали по его письменному заявлению, с описью состояния?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  marketingConsentQuestion('AS', '408'),

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  ...premisesOperationQuestions('AS'),

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'AS-701',
    block: 7,
    text: 'Зарегистрирован ли товарный знак или бренд автосервиса?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Планирую', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'AS-702',
    block: 7,
    text: 'Заключаются ли письменные договоры с подрядчиками (вывоз масла, поставщики запчастей)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не со всеми', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'AS-801',
    block: 8,
    text: 'Предупреждаете ли клиента, что итоговая стоимость может измениться после разборки, и согласовываете ли доп. работы до их выполнения?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  // --- Блок 9. Финансовая безопасность (риск блокировки счёта, 115-ФЗ, 01.09.2026) ---
  ...financialSecurityQuestions('AS'),
];

const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'auto_service', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
