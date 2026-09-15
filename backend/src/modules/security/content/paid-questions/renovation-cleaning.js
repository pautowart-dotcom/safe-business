// Платный аудит, ниша "Уборка после ремонта и стройки" — третья ниша
// сегмента "Клининг". Блоки 6, 9 идентичны остальным нишам (см.
// violations/renovation-cleaning.js — та же нормативная база и штрафы).
// RC-101..105, RC-201/202, RC-301..303, RC-506, RC-801 — новый контент.
// Оферты как отдельного пункта нет (см. комментарий в шапке
// violations/renovation-cleaning.js) — реклама занимает код -405, не -406.

const {
  personnelReportingQuestion,
  laborMisrepresentationQuestion,
  premisesOperationQuestions,
  financialSecurityQuestions,
} = require('../sharedQuestionBlocks');

const QUESTIONS = [
  // --- Блок 1. Юридическая база (всегда) ---
  {
    code: 'RC-101',
    block: 1,
    text: 'Подтверждено ли документами на помещение (договором аренды или сведениями ЕГРН), что использование под офис/склад допускается?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'RC-102',
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
    code: 'RC-103',
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
    code: 'RC-104',
    block: 1,
    text: 'Заключаете ли вы с клиентом договор/бланк-заказ и фиксируете ли состояние отделки до начала работ?',
    hint: 'Свежая отделка после ремонта дороже типового жилья — спор о повреждении без фиксации состояния обходится дороже.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'RC-105',
    block: 1,
    text: 'Размещена ли в офисе обязательная информация для потребителей («уголок потребителя»)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 2. Строительный мусор (всегда) ---
  {
    code: 'RC-201',
    block: 2,
    text: 'Заключён ли договор с организацией, имеющей лицензию на транспортирование строительных отходов, на их вывоз?',
    hint: 'Строительный мусор не относится к ТКО и не вывозится обычным региональным оператором.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Вывоз мусора — обязанность заказчика по договору', points: 1 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'RC-202',
    block: 2,
    text: 'Складируется ли строительный мусор до вывоза с учётом пожарной безопасности, не перекрывая эвакуационные пути?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 3. Оборудование (всегда) ---
  {
    code: 'RC-301',
    block: 3,
    text: 'Есть ли сертификаты/декларации соответствия на клининговое оборудование?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'RC-302',
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
    code: 'RC-303',
    block: 3,
    text: 'Обеспечен ли персонал СИЗ от пыли и химии (респираторы, защитные очки, перчатки)?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 4. Персонал (показывается только при наличии сотрудников,
  // кроме RC-504) ---
  {
    code: 'RC-501',
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
  laborMisrepresentationQuestion('RC', { workerNoun: 'клинеры' }),
  {
    code: 'RC-503',
    block: 4,
    text: 'Контролируются ли сроки действия медицинских книжек сотрудников?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'RC-504',
    block: 4,
    text: 'Ведётся ли журнал инструктажа сотрудников, включая работу с оборудованием и пылью?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  personnelReportingQuestion('RC'),
  {
    code: 'RC-506',
    block: 4,
    text: 'Если по итогам СОУТ рабочее место отнесено к вредному классу по пыли — проходят ли сотрудники обязательные периодические медосмотры?',
    hint: 'Применимо только если СОУТ показала вредный класс по этому фактору.',
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Вредный класс не выявлен / неприменимо', points: 1 },
      { label: 'Нет, хотя выявлен', points: 0 },
    ],
  },

  // --- Блок 5. Персональные данные (всегда) ---
  {
    code: 'RC-401',
    block: 5,
    text: 'Подано ли уведомление о деятельности в качестве оператора персональных данных?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'RC-402',
    block: 5,
    text: 'Размещена ли политика конфиденциальности?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'RC-403',
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
    code: 'RC-405',
    block: 5,
    text: 'Собираете ли вы согласие клиента перед РЕКЛАМНОЙ рассылкой (акции, скидки) по SMS/мессенджерам/email?',
    hint: 'Напоминания о записи (дата, время) рекламой не считаются и отдельного согласия по этой норме не требуют.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  ...premisesOperationQuestions('RC'),

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'RC-701',
    block: 7,
    text: 'Зарегистрирован ли товарный знак или бренд компании?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Планирую', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'RC-702',
    block: 7,
    text: 'Заключаются ли письменные договоры с подрядчиками (вывоз мусора, аренда рабочих мест)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не со всеми', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'RC-801',
    block: 8,
    text: 'Предупреждаете ли клиента заранее об ограничениях результата (сложные загрязнения, требующие спецобработки)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Только в явных случаях', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  // --- Блок 9. Финансовая безопасность (риск блокировки счёта, 115-ФЗ, 01.09.2026) ---
  ...financialSecurityQuestions('RC'),
];

const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'renovation_cleaning', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
