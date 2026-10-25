// Платный аудит, ниша "Фотостудия". Блоки 1 (кроме PH-101), 4 (кроме
// PH-503/504), 6, 9 идентичны остальным нишам бытовых/сервисных услуг (см.
// violations/photo-studio.js — та же нормативная база и штрафы). PH-201/
// 202, PH-301..303, PH-403/404/407, PH-702/703, PH-801 — новый контент под
// специфику фотостудии, см. комментарий в шапке violations/photo-studio.js.

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
    code: 'PH-101',
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
  ...legalBasisCoreQuestions('PH', { notificationActivity: 'услуг фотостудии' }),

  // --- Блок 2. Безопасность студии (всегда) ---
  {
    code: 'PH-201',
    block: 2,
    text: 'Проверяете ли регулярно свет и крепление кабелей на полу?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не регулярно', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'PH-202',
    block: 2,
    text: 'Записываете ли вы уборки помещения?',
    hint: 'Журнал уборки: дата, какая уборка, каким средством, кто убирал и подпись.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Записываем, но без подписей', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 3. Оборудование (всегда) ---
  {
    code: 'PH-301',
    block: 3,
    text: 'Есть ли сертификаты или декларации на студийный свет и другое электрооборудование?',
    hint: 'Обычно документы даёт поставщик; декларацию можно найти бесплатно по названию товара в реестре Росаккредитации (pub.fsa.gov.ru).',
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'PH-302',
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
    code: 'PH-303',
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

  // --- Блок 4. Персонал (показывается только при наличии сотрудников,
  // кроме PH-504) ---
  {
    code: 'PH-501',
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
  laborMisrepresentationQuestion('PH', { workerNoun: 'фотографы и ретушёры' }),
  medicalBooksQuestion('PH'),
  {
    code: 'PH-504',
    block: 4,
    text: 'Проводите ли инструктажи сотрудников по охране труда и записываете ли их?',
    hint: 'Включая работу со студийным светом и электрооборудованием. Вводный — при приёме, первичный — до начала работы, повторный — не реже раза в полгода.',
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  personnelReportingQuestion('PH'),

  // --- Блок 5. Персональные данные и права на фотографии (всегда) ---
  ...personalDataCoreQuestions('PH', {
    rcnHintExtra: 'Для фотостудии особенно важно: фотографии клиентов — персональные данные по своей сути, а не только сопутствующая информация.',
  }),
  {
    code: 'PH-403',
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
    code: 'PH-404',
    block: 5,
    text: 'Берёте ли отдельное согласие клиента на его фото в портфолио и рекламе?',
    hint: 'Согласие на съёмку — это не согласие на публикацию. Для портфолио нужно отдельное письменное согласие.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Иногда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ofertaQuestion('PH'),
  marketingConsentQuestion('PH', '406'),
  {
    code: 'PH-407',
    block: 5,
    text: 'Берёте ли письменное согласие родителя на съёмку ребёнка?',
    hint: 'Если ребёнок — главный герой съёмки. Шаблон есть в «Документах».',
    showIf: null,
    answers: [
      { label: 'Да, всегда', points: 1 },
      { label: 'Не снимаю детей отдельно', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  ...premisesOperationQuestions('PH'),

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'PH-701',
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
    code: 'PH-702',
    block: 7,
    text: 'Прописано ли в договоре, как клиент может использовать фотографии?',
    hint: 'Для себя, публиковать, использовать в рекламе. По умолчанию права на фото у фотографа, даже если съёмка оплачена.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Проговариваем устно, письменно не фиксируем', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'PH-703',
    block: 7,
    text: 'Есть ли письменные договоры с фотографами, ретушёрами и подрядчиками?',
    hint: 'С теми, кто работает у вас не в штате.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не со всеми', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'PH-801',
    block: 8,
    text: 'Предупреждаете ли клиента письменно об ограничениях результата?',
    hint: 'Цвета на экране и при печати отличаются, объём ретуши и число кадров — по пакету. Бланк есть в «Документах».',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Только устно', points: 0 },
      { label: 'Нет', points: 0 },
    ],
  },
  // --- Блок 9. Финансовая безопасность (риск блокировки счёта, 115-ФЗ, 01.09.2026) ---
  ...financialSecurityQuestions('PH'),
];

const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'photo_studio', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
