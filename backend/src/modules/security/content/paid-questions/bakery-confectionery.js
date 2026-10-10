// Платный аудит, ниша "Кондитерская и пекарня" — вторая ниша сегмента
// "Общепит". Блоки 4 (кроме BK-503/504), 6, 9 идентичны cafe_basic и другим
// нишам (см. violations/bakery-confectionery.js — та же нормативная база).
// BK-201..203, BK-303, BK-403/404 (нет фото), BK-801 — новый контент.

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
    code: 'BK-101',
    block: 1,
    text: 'Подтверждено ли документами на помещение, что оно допускает производство и продажу продукции общественного питания?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'BK-102',
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
    code: 'BK-103',
    block: 1,
    text: 'Подключён ли эквайринг (приём оплаты картой), если ваша выручка обязывает его иметь?',
    hint: 'Обязательно, если выручка за прошлый год больше 20 млн ₽ (п. 1 ст. 16.1 Закона о защите прав потребителей); при меньшей выручке или без доступа к интернету обязанности нет.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'BK-104',
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

  // --- Блок 2. Специфика выпечки и кондитерских изделий (всегда) ---
  {
    code: 'BK-201',
    block: 2,
    text: 'Если вы перепродаёте покупные упакованные сладости (конфеты, шоколад, печенье) — зарегистрированы ли вы в «Честном ЗНАКЕ» и пробиваете ли их по кодам маркировки?',
    hint: 'Своя выпечка и торты, приготовленные на месте, маркировку не требуют. Хлебобулочные изделия со сроком годности до 30 суток — тоже.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Такой продукции нет / вся продукция освобождена', points: 1 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'BK-202',
    block: 2,
    text: 'Продаются ли изделия с кремом только из охлаждаемой витрины, и прописаны ли сроки и температура их хранения в технологических картах?',
    hint: 'Ориентир — +2…+6 °C; заварной, сливочный, творожный и белково-сбивной кремы лучше использовать сразу после приготовления.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'BK-203',
    block: 2,
    text: 'Указывается ли информация об аллергенах (орехи, яйца, молочные продукты, глютен) на ценниках/в меню/на упаковке?',
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
    code: 'BK-301',
    block: 3,
    text: 'Есть ли сертификаты/декларации соответствия на оборудование (печи, миксеры, холодильное оборудование)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'BK-302',
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
    code: 'BK-303',
    block: 3,
    text: 'Контролируется и фиксируется ли температура холодильного/морозильного оборудования?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 4. Персонал (показывается только при наличии сотрудников,
  // кроме BK-504) ---
  {
    code: 'BK-501',
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
  laborMisrepresentationQuestion('BK', { workerNoun: 'пекари/кондитеры' }),
  medicalBooksQuestion('BK'),
  {
    code: 'BK-504',
    block: 4,
    text: 'Ведётся ли журнал инструктажа сотрудников?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  personnelReportingQuestion('BK'),

  // --- Блок 5. Персональные данные (всегда) ---
  ...personalDataCoreQuestions('BK'),
  {
    code: 'BK-403',
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
  ofertaQuestion('BK'),
  marketingConsentQuestion('BK', '406'),

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  ...premisesOperationQuestions('BK'),

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'BK-701',
    block: 7,
    text: 'Зарегистрирован ли товарный знак или бренд пекарни/кондитерской?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Планирую', points: 0.5 },
      { label: 'Нет', points: 0 },
      { label: 'Точка франшизы — знак зарегистрирован у франшизы', points: 1 },
    ],
  },
  {
    code: 'BK-702',
    block: 7,
    text: 'Заключаются ли письменные договоры с подрядчиками (поставщики сырья, вывоз ТБО)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не со всеми', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'BK-801',
    block: 8,
    text: 'Оформляете ли вы письменный бланк заказа на изготовление торта/изделия на дату с условиями предоплаты и отмены?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  // --- Блок 9. Финансовая безопасность (риск блокировки счёта, 115-ФЗ, 01.09.2026) ---
  ...financialSecurityQuestions('BK'),
];

const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'bakery_confectionery', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
