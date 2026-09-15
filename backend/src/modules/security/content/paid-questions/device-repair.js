// Платный аудит, ниша "Ремонт компьютеров и телефонов" — седьмая ниша
// сегмента "Бытовые услуги". Блоки 4 (кроме DR-503/504), 6, 9 идентичны
// остальным нишам сегмента (см. violations/device-repair.js — та же
// нормативная база). DR-105, DR-201/202, DR-302/303, DR-801 — новый
// контент под специфику ниши.

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
    code: 'DR-101',
    block: 1,
    text: 'Подтверждено ли документами на помещение, что использование под мастерскую по ремонту техники допускается?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'DR-102',
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
    code: 'DR-103',
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
    code: 'DR-104',
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
    code: 'DR-105',
    block: 1,
    text: 'Оформляется ли письменная квитанция/наряд-заказ при приёме устройства в ремонт?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 2. Личные данные на устройстве клиента (всегда) ---
  {
    code: 'DR-201',
    block: 2,
    text: 'Есть ли у вас внутреннее правило не просматривать личные файлы/переписки/приложения клиента без производственной необходимости?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не формализовано, но соблюдается', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'DR-202',
    block: 2,
    text: 'Предупреждаете ли клиента о риске потери данных и рекомендуете ли сделать резервную копию перед сдачей устройства?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Только в явно рискованных случаях', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 3. Оборудование и утилизация (всегда) ---
  {
    code: 'DR-301',
    block: 3,
    text: 'Есть ли сертификаты/декларации соответствия на диагностическое оборудование?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'DR-302',
    block: 3,
    text: 'Заключён ли договор с лицензированным переработчиком на утилизацию заменённых электронных компонентов?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'DR-303',
    block: 3,
    text: 'Хранятся ли снятые батареи/аккумуляторы отдельно, безопасно, и передаются ли лицензированному переработчику?',
    hint: 'Батареи — отходы I-II класса опасности, строже большинства других отходов.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 4. Персонал (показывается только при наличии сотрудников,
  // кроме DR-504) ---
  {
    code: 'DR-501',
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
  laborMisrepresentationQuestion('DR', { workerNoun: 'мастера' }),
  medicalBooksQuestion('DR'),
  {
    code: 'DR-504',
    block: 4,
    text: 'Ведётся ли журнал инструктажа сотрудников, включая работу с паяльным оборудованием и повреждёнными аккумуляторами?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  personnelReportingQuestion('DR'),

  // --- Блок 5. Персональные данные (всегда) ---
  ...personalDataCoreQuestions('DR'),
  {
    code: 'DR-403',
    block: 5,
    text: 'Оформляются ли письменные согласия клиентов на обработку персональных данных при приёме устройства?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ofertaQuestion('DR'),
  marketingConsentQuestion('DR', '406'),

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  ...premisesOperationQuestions('DR'),

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'DR-701',
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
    code: 'DR-702',
    block: 7,
    text: 'Заключаются ли письменные договоры с подрядчиками (поставщики запчастей, вывоз электронных отходов)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не со всеми', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'DR-801',
    block: 8,
    text: 'Согласовываете ли с клиентом стоимость ремонта ДО начала работ, особенно если она вырастает после диагностики?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  // --- Блок 9. Финансовая безопасность (риск блокировки счёта, 115-ФЗ, 01.09.2026) ---
  ...financialSecurityQuestions('DR'),
];

const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'device_repair', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
