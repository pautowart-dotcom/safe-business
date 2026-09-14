// Платный аудит, ниша "Ремонт бытовой техники". Блоки 4 (кроме AR-501/504),
// 5 (кроме AR-403/404), 6, 9 идентичны остальным нишам бытовых/сервисных
// услуг (см. violations/appliance-repair.js — та же нормативная база и
// штрафы). AR-105/106, AR-201..203, AR-301..304, AR-403/404, AR-701/702,
// AR-801 — новый контент под специфику ремонта техники, источники — см.
// комментарий в шапке violations/appliance-repair.js.

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
    code: 'AR-101',
    block: 1,
    text: 'Подтверждено ли документами на помещение (договором аренды — если арендуете, или сведениями ЕГРН/техпаспорта о разрешённом использовании — если помещение в собственности), что оно используется под мастерскую по ремонту техники?',
    hint: 'Если помещение в собственности: смотрите не на договор аренды (его не будет), а на то, что помещение нежилое и его разрешённое использование по документам это допускает.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ...legalBasisCoreQuestions('AR'),
  {
    code: 'AR-105',
    block: 1,
    text: 'Оформляется ли при приёме техники в ремонт письменная квитанция/заказ-наряд с описанием устройства, его состояния и заявленной неисправности?',
    hint: 'При споре о состоянии устройства на момент приёма без квитанции сложно доказать, что повреждение уже было.',
    showIf: null,
    answers: [
      { label: 'Да, всегда', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'AR-106',
    block: 1,
    text: 'Согласовываете ли срок ремонта письменно (не более 45 дней без отдельного согласия клиента) и фиксируете ли гарантию на заменённые детали?',
    hint: 'Ориентир по закону — 45 дней максимум, если нет отдельного письменного соглашения о более долгом сроке.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 2. Санитарная безопасность и работа с техникой (всегда) ---
  {
    code: 'AR-201',
    block: 2,
    text: 'Оборудованы ли рабочие места диагностики средствами защиты от поражения током (диэлектрические коврики, УЗО)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'AR-202',
    block: 2,
    text: 'Накапливаются ли отходы электронного/электрического оборудования отдельно от обычного мусора и передаются лицензированному оператору?',
    hint: 'Ориентир по закону — передача не позднее 11 месяцев с момента образования отходов.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет, выбрасываем с обычным мусором', points: 0 },
    ],
  },
  {
    code: 'AR-203',
    block: 2,
    text: 'Накапливаются ли извлечённые батареи и аккумуляторы отдельно и передаются лицензированному оператору?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет, выбрасываем с обычным мусором', points: 0 },
    ],
  },

  // --- Блок 3. Оборудование (всегда) ---
  {
    code: 'AR-301',
    block: 3,
    text: 'Есть ли сертификаты/декларации соответствия на диагностическое и паяльное оборудование?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'AR-302',
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
    code: 'AR-303',
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
  {
    code: 'AR-304',
    block: 3,
    text: 'Оборудовано ли рабочее место пайки вытяжкой/дымоуловителем?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 4. Персонал (показывается только при наличии сотрудников,
  // кроме AR-504) ---
  {
    code: 'AR-501',
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
  laborMisrepresentationQuestion('AR', { workerNoun: 'мастера по ремонту' }),
  medicalBooksQuestion('AR'),
  {
    code: 'AR-504',
    block: 4,
    text: 'Ведётся ли журнал инструктажа сотрудников, включая электробезопасность и работу с паяльным оборудованием?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  personnelReportingQuestion('AR'),

  // --- Блок 5. Персональные данные (всегда) ---
  ...personalDataCoreQuestions('AR'),
  {
    code: 'AR-403',
    block: 5,
    text: 'Оформляются ли письменные согласия клиентов на обработку персональных данных при оформлении заказа?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'AR-404',
    block: 5,
    text: 'Берёте ли письменное согласие клиента перед публикацией фото/видео устройства или процесса ремонта?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Иногда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ofertaQuestion('AR'),
  marketingConsentQuestion('AR', '406'),

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  ...premisesOperationQuestions('AR'),

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'AR-701',
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
    code: 'AR-702',
    block: 7,
    text: 'Заключаются ли письменные договоры с поставщиками запчастей и подрядчиками?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не со всеми', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'AR-801',
    block: 8,
    text: 'Предупреждаете ли клиента письменно о риске потери данных на устройстве и об использовании неоригинальных запчастей (если применимо)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Только устно', points: 0 },
      { label: 'Нет', points: 0 },
    ],
  },
  // --- Блок 9. Финансовая безопасность (риск блокировки счёта, 115-ФЗ, 01.09.2026) ---
  ...financialSecurityQuestions('AR'),
];

const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'appliance_repair', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
