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
    text: 'Подтверждено ли документами на помещение (договором аренды — если арендуете, или сведениями ЕГРН/техпаспорта о разрешённом использовании — если помещение в собственности), что оно используется под фотостудию?',
    hint: 'Если помещение в собственности: смотрите не на договор аренды (его не будет), а на то, что помещение нежилое и его разрешённое использование по документам это допускает.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ...legalBasisCoreQuestions('PH'),

  // --- Блок 2. Безопасность студии (всегда) ---
  {
    code: 'PH-201',
    block: 2,
    text: 'Проверяются ли регулярно исправность студийного света и надёжность крепления кабелей на полу?',
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
    text: 'Ведётся ли журнал учёта уборки помещения?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Без подписей', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 3. Оборудование (всегда) ---
  {
    code: 'PH-301',
    block: 3,
    text: 'Есть ли сертификаты/декларации соответствия на студийный свет и другое электрооборудование?',
    hint: null,
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
    code: 'PH-303',
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
  // кроме PH-504) ---
  {
    code: 'PH-501',
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
  laborMisrepresentationQuestion('PH', { workerNoun: 'фотографы и ретушёры' }),
  medicalBooksQuestion('PH'),
  {
    code: 'PH-504',
    block: 4,
    text: 'Ведётся ли журнал инструктажа сотрудников, включая безопасную работу со студийным электрооборудованием?',
    hint: null,
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
    text: 'Оформляются ли письменные согласия клиентов на обработку персональных данных при записи на съёмку?',
    hint: null,
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
    text: 'Берёте ли отдельное письменное согласие клиента на использование его фотографий в портфолио/рекламе студии (отдельно от самой услуги съёмки)?',
    hint: null,
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
    text: 'Оформляете ли письменное согласие родителя/законного представителя на съёмку ребёнка, если он — основной объект съёмки?',
    hint: null,
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
    text: 'Зарегистрирован ли товарный знак или бренд студии?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Планирую', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'PH-702',
    block: 7,
    text: 'Прописан ли в оферте или договоре объём прав клиента на использование фотографий (личное использование, публикация, коммерческое использование)?',
    hint: 'Фотография по умолчанию — объект авторского права фотографа, а не клиента, даже если съёмка оплачена.',
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
    text: 'Заключаются ли письменные договоры с внештатными фотографами, ретушёрами и подрядчиками?',
    hint: null,
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
    text: 'Предупреждаете ли клиента письменно об ограничениях результата (цветопередача экран/печать, объём ретуши, количество кадров)?',
    hint: null,
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
