// Платный аудит, ниша "Волосы (парикмахерские услуги)". Блоки 1, 3, 4, 5, 6,
// 7 идентичны нише "Маникюр и педикюр" (общие требования для бытовых услуг).
// Блок 2 (санитария) почти без изменений: СанПиН для предприятий бытового
// обслуживания одинаково нормирует стерилизацию режущего инструмента
// (ножницы, машинки, бритвы) что для маникюра, что для парикмахерских услуг,
// включая риск контакта с кровью при бритье/стрижке — источник тот же
// массив нормативных актов (docs/security-engine/06_Paid_Audit_FINAL.md),
// адаптирована только формулировка под инструмент парикмахера.

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
    code: 'HR-101',
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
  ...legalBasisCoreQuestions('HR'),

  // --- Блок 2. Санитарная безопасность (всегда) ---
  {
    code: 'HR-201',
    block: 2,
    text: 'Ведётся ли журнал стерилизации инструмента (ножницы, машинки, бритвы, расчёски)?',
    hint: 'Один из первых документов, который могут запросить.',
    showIf: null,
    answers: [
      { label: 'Да, регулярно', points: 1 },
      { label: 'Нерегулярно', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'HR-202',
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
    code: 'HR-203',
    block: 2,
    text: 'Если возникают порезы и контакт с кровью (бритьё, стрижка машинкой), заключён ли договор на вывоз отходов класса Б?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Контакта с кровью нет', points: 1 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'HR-204',
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
    code: 'HR-205',
    block: 2,
    text: 'Ведётся ли журнал работы рециркулятора?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Нет журнала', points: 0 },
      { label: 'Рециркулятора нет', points: 0, violationCodeOverride: 'HR-206-доп' },
    ],
  },
  {
    code: 'HR-206',
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
    code: 'HR-207',
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
    code: 'HR-208',
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
    code: 'HR-209',
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
    code: 'HR-301',
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
    code: 'HR-302',
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
    code: 'HR-303',
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
    code: 'HR-304',
    block: 3,
    text: 'Есть ли сертификаты на используемые материалы (красители, составы для завивки, косметика)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'HR-305',
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
  // кроме HR-502) ---
  {
    code: 'HR-501',
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
  laborMisrepresentationQuestion('HR'),
  medicalBooksQuestion('HR'),
  {
    code: 'HR-504',
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

  personnelReportingQuestion('HR'),

  // --- Блок 5. Персональные данные (всегда) ---
  ...personalDataCoreQuestions('HR'),
  {
    code: 'HR-403',
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
    code: 'HR-404',
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
  ofertaQuestion('HR'),
  marketingConsentQuestion('HR', '406'),

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  ...premisesOperationQuestions('HR'),

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'HR-701',
    block: 7,
    text: 'Используется ли музыка для клиентов в помещении студии?',
    hint: 'Публичное исполнение музыки требует лицензии (РАО/ВОИС) — риск есть только если она не оформлена.',
    showIf: null,
    answers: [
      { label: 'Нет', points: 1 },
      { label: 'Да, лицензия оформлена', points: 1 },
      { label: 'Да, без лицензии', points: 0 },
    ],
  },
  {
    code: 'HR-702',
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
    code: 'HR-703',
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

  // --- Блок 8. Химические процедуры (показывается только если владелец
  // отметил такие услуги при выборе ниши — showIf: has_hair_chemical_treatments,
  // см. visibility.js и profile.js). См. комментарий в violations/hair.js про
  // дату добавления и статус проверки.
  {
    code: 'HR-801',
    block: 8,
    text: 'Есть ли в рабочей зоне вытяжная вентиляция или организовано проветривание на время процедур кератинового выпрямления/ботокса для волос?',
    hint: 'Составы с формальдегидом выделяют пары при нагреве утюжком — без вентиляции это риск и для мастера, и для клиента.',
    showIf: 'has_hair_chemical_treatments',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично (окно, но не вытяжка)', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'HR-802',
    block: 8,
    text: 'Использует ли мастер средства индивидуальной защиты (перчатки, респиратор) при нанесении составов с формальдегидом?',
    hint: null,
    showIf: 'has_hair_chemical_treatments',
    answers: [
      { label: 'Да, оба средства', points: 1 },
      { label: 'Только перчатки', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'HR-803',
    block: 8,
    text: 'Есть ли сертификат/декларация на состав для кератинового выпрямления с указанием содержания формальдегида?',
    hint: null,
    showIf: 'has_hair_chemical_treatments',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'HR-804',
    block: 8,
    text: 'Подписывает ли клиент отдельное информированное согласие на химические процедуры (риски ожога, аллергии на краску/завивку) — помимо согласия на обработку персональных данных?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Есть только согласие на ПД', points: 0 },
      { label: 'Нет', points: 0 },
    ],
  },
  // --- Блок 9. Финансовая безопасность (риск блокировки счёта, 115-ФЗ, 01.09.2026) ---
  ...financialSecurityQuestions('HR'),
];

const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'hair', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
