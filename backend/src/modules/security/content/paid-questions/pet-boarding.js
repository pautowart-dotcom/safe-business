// Платный аудит, ниша "Передержка и гостиница для животных". Блоки 1 (кроме
// PB-101/101-доп/105/106), 4 (кроме PB-501/504), 5 (кроме PB-403/404), 6, 9
// идентичны остальным нишам бытовых/сервисных услуг (см.
// violations/pet-boarding.js — та же нормативная база и штрафы). PB-105/106,
// PB-201..204, PB-301..303, PB-403/404, PB-701/702, PB-801 — новый контент
// под специфику передержки, источник — ГОСТ Р 57014-2016 (первоисточник
// прочитан целиком), см. комментарий в шапке violations/pet-boarding.js.

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
    code: 'PB-101',
    block: 1,
    text: 'Подтверждено ли документами на помещение (договором аренды — если арендуете, или сведениями ЕГРН/техпаспорта о разрешённом использовании — если помещение в собственности), что оно используется как зоогостиница?',
    hint: 'Если помещение в собственности: смотрите не на договор аренды (его не будет), а на то, что помещение нежилое и его разрешённое использование по документам это допускает. Принимаете животных на передержку у себя дома (жилое помещение) — выберите отдельный вариант ниже.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Использую жилое помещение по адресу проживания — передержка на дому (п.3.4 ГОСТ Р 57014-2016)', points: 0.5, violationCodeOverride: 'PB-101-доп' },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ...legalBasisCoreQuestions('PB'),
  {
    code: 'PB-105',
    block: 1,
    text: 'Заключается ли с владельцем письменный договор на временное содержание животного со всеми условиями приёма, содержания и возврата?',
    hint: 'Защищает вас в спорах о состоянии/судьбе животного и фиксирует, кто и за что отвечает.',
    showIf: null,
    answers: [
      { label: 'Да, всегда', points: 1 },
      { label: 'Не всегда / не все условия прописаны', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'PB-106',
    block: 1,
    text: 'Проверяете ли вы ветеринарные документы (состояние здоровья, вакцинация) при приёме животного?',
    hint: 'Ориентир — осмотр ветврачом не позднее чем за 3 дня до заезда.',
    showIf: null,
    answers: [
      { label: 'Да, всегда', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 2. Содержание животных (всегда) ---
  {
    code: 'PB-201',
    block: 2,
    text: 'Соответствуют ли номера для животных базовым требованиям (достаточная площадь, освещение, вентиляция, комфортная температура, изоляция друг от друга)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'PB-202',
    block: 2,
    text: 'Огорожены ли площадки для выгула, и разделён ли выгул разных видов животных (кошки отдельно от собак и т.д.)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да, всё соблюдается', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'PB-203',
    block: 2,
    text: 'Убираются ли места содержания животных не реже раза в день, а между постояльцами проводится дезинфекция?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'PB-204',
    block: 2,
    text: 'Есть ли установленный порядок действий на случай ухудшения состояния животного во время пребывания?',
    hint: 'Контакты ближайшей круглосуточной ветклиники, правило "сначала вызвать врача, потом уведомить владельца".',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Персонал в курсе, но не записано', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 3. Оборудование (всегда) ---
  {
    code: 'PB-301',
    block: 3,
    text: 'Есть ли сертификаты/декларации соответствия на используемое оборудование (вентиляция, климат-контроль, мойка)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'PB-302',
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
    code: 'PB-303',
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
  // кроме PB-504) ---
  {
    code: 'PB-501',
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
  laborMisrepresentationQuestion('PB', { workerNoun: 'сотрудники по уходу за животными' }),
  medicalBooksQuestion('PB'),
  {
    code: 'PB-504',
    block: 4,
    text: 'Проводится ли инструктаж по безопасному обращению с животными разных видов (фиксация, распознавание агрессии/стресса)?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  personnelReportingQuestion('PB'),

  // --- Блок 5. Персональные данные (всегда) ---
  ...personalDataCoreQuestions('PB'),
  {
    code: 'PB-403',
    block: 5,
    text: 'Оформляются ли письменные согласия владельцев на обработку персональных данных при заключении договора?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'PB-404',
    block: 5,
    text: 'Берёте ли письменное согласие владельца перед публикацией фото/видео питомца-постояльца?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Иногда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ofertaQuestion('PB'),
  marketingConsentQuestion('PB', '406'),

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  ...premisesOperationQuestions('PB', { q601Hint: 'Включая ежедневную уборку продуктов жизнедеятельности животных с площадок выгула, не только обычный бытовой мусор.' }),

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'PB-701',
    block: 7,
    text: 'Зарегистрирован ли товарный знак или бренд зоогостиницы?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Планирую', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'PB-702',
    block: 7,
    text: 'Заключены ли письменные договоры с партнёрами (ветклиника, поставщики кормов)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не со всеми', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'PB-801',
    block: 8,
    text: 'Прописаны ли в договоре ограничения ответственности за гибель возрастного/хронически больного животного и оговорка, что вакцинация не даёт полной гарантии?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Только устно', points: 0 },
      { label: 'Нет', points: 0 },
    ],
  },
  // --- Блок 9. Финансовая безопасность (риск блокировки счёта, 115-ФЗ, 01.09.2026) ---
  ...financialSecurityQuestions('PB'),
];

const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'pet_boarding', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
