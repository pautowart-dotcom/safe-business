// Платный аудит, ниша "Барбершоп". Идентична paid-questions/hair.js по
// нормативной базе (см. комментарий в violations/barbershop.js про
// СП 2.1.3678-20), формулировки адаптированы под инструмент барбера. Блок 8
// ниши "hair" (химические составы) сюда не перенесён — см. тот же
// комментарий в violations/barbershop.js.

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
    code: 'BB-101',
    block: 1,
    text: 'Подтверждено ли документами на помещение (договором аренды — если арендуете, или сведениями ЕГРН/техпаспорта о разрешённом использовании — если помещение в собственности), что оно используется для оказания парикмахерских услуг?',
    hint: 'Если помещение в собственности: смотрите не на договор аренды (его не будет), а на то, что помещение нежилое и его разрешённое использование по документам допускает оказание услуг.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ...legalBasisCoreQuestions('BB'),

  // --- Блок 2. Санитарная безопасность (всегда) ---
  {
    code: 'BB-201',
    block: 2,
    text: 'Ведётся ли журнал стерилизации инструмента (машинки, триммеры, опасные бритвы, ножницы)?',
    hint: 'Один из первых документов, который могут запросить.',
    showIf: null,
    answers: [
      { label: 'Да, регулярно', points: 1 },
      { label: 'Нерегулярно', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'BB-202',
    block: 2,
    text: 'Используются ли крафт-пакеты для хранения стерильного инструмента?',
    hint: 'Подтверждают сохранение стерильности после обработки.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Иногда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'BB-203',
    block: 2,
    text: 'Если возникают порезы и контакт с кровью (бритьё опасной бритвой, стрижка машинкой), заключён ли договор на вывоз отходов класса Б?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Контакта с кровью нет', points: 1 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'BB-204',
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
  {
    code: 'BB-205',
    block: 2,
    text: 'Ведётся ли журнал работы рециркулятора?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Нет журнала', points: 0 },
      { label: 'Рециркулятора нет', points: 0, violationCodeOverride: 'BB-206-доп' },
    ],
  },
  {
    code: 'BB-206',
    block: 2,
    text: 'Есть ли программа производственного контроля — документ, описывающий санитарный контроль и обязательные мероприятия?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'BB-207',
    block: 2,
    text: 'Есть ли договор на проведение дезинсекции и дератизации?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'BB-208',
    block: 2,
    text: 'Утверждён ли график генеральных уборок?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'BB-209',
    block: 2,
    text: 'Проводились ли лабораторные исследования в рамках производственного контроля?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 3. Оборудование и материалы (всегда) ---
  {
    code: 'BB-301',
    block: 3,
    text: 'Есть ли сертификаты ЕАС на оборудование?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'BB-302',
    block: 3,
    text: 'Есть ли инструкции на русском языке?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'BB-303',
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
    code: 'BB-304',
    block: 3,
    text: 'Есть ли сертификаты на используемые материалы (средства для бритья, красители для бороды/волос, косметика по уходу)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'BB-305',
    block: 3,
    text: 'Сохраняются ли документы на закупку расходных материалов?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 4. Персонал (показывается только при наличии сотрудников,
  // кроме BB-502) ---
  {
    code: 'BB-501',
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
  laborMisrepresentationQuestion('BB'),
  medicalBooksQuestion('BB'),
  {
    code: 'BB-504',
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

  personnelReportingQuestion('BB'),

  // --- Блок 5. Персональные данные (всегда) ---
  ...personalDataCoreQuestions('BB'),
  {
    code: 'BB-403',
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
    code: 'BB-404',
    block: 5,
    text: 'Берёте ли письменное согласие клиента перед публикацией фото/видео?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Иногда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ofertaQuestion('BB'),
  marketingConsentQuestion('BB', '406'),

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  ...premisesOperationQuestions('BB'),

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'BB-701',
    block: 7,
    text: 'Используется ли музыка для клиентов в помещении барбершопа?',
    hint: 'Публичное исполнение музыки требует лицензии (РАО/ВОИС) — риск есть только если она не оформлена.',
    showIf: null,
    answers: [
      { label: 'Нет', points: 1 },
      { label: 'Да, лицензия оформлена', points: 1 },
      { label: 'Да, без лицензии', points: 0 },
    ],
  },
  {
    code: 'BB-702',
    block: 7,
    text: 'Зарегистрирован ли товарный знак или бренд барбершопа?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Планирую', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'BB-703',
    block: 7,
    text: 'Заключаются ли письменные договоры с подрядчиками и исполнителями?',
    hint: 'Например: клининг, бухгалтерия, маркетинг, разовые мастера/специалисты со стороны.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не со всеми', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'BB-801',
    block: 8,
    text: 'Подписывает ли клиент отдельное информированное согласие на бритьё опасной бритвой (риски пореза/инфицирования, раздражения от средств) — помимо согласия на обработку персональных данных?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Есть только согласие на ПД', points: 0 },
      { label: 'Нет', points: 0 },
    ],
  },
  // --- Блок 9. Финансовая безопасность (риск блокировки счёта, 115-ФЗ, 01.09.2026) ---
  ...financialSecurityQuestions('BB'),
];

const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'barbershop', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
