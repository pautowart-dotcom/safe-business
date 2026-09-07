// Платный аудит, ниша "Фитнес-студия / тренажёрный зал". Блоки 1 (кроме
// FT-101), 4 (кроме FT-504), 5, 6, 9 идентичны остальным нишам бытовых/
// сервисных услуг (см. violations/fitness-gym.js — та же нормативная база и
// штрафы). FT-201..204, FT-301..304, FT-504 — новый контент под специфику
// фитнеса, см. комментарий в шапке violations/fitness-gym.js про источники
// и что не проверено.

const {
  personnelReportingQuestion,
  legalBasisCoreQuestions,
  laborMisrepresentationQuestion,
  personalDataCoreQuestions,
  ofertaQuestion,
  marketingConsentQuestion,
  premisesOperationQuestions,
  financialSecurityQuestions,
} = require('../sharedQuestionBlocks');

const QUESTIONS = [
  // --- Блок 1. Юридическая база (всегда) ---
  {
    code: 'FT-101',
    block: 1,
    text: 'Подтверждено ли документами на помещение (договором аренды — если арендуете, или сведениями ЕГРН/техпаспорта о разрешённом использовании — если помещение в собственности), что оно используется для физкультурно-оздоровительной деятельности?',
    hint: 'Если помещение в собственности: смотрите не на договор аренды (его не будет), а на то, что помещение нежилое и его разрешённое использование по документам это допускает.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ...legalBasisCoreQuestions('FT'),

  // --- Блок 2. Санитарная безопасность и здоровье клиентов (всегда) ---
  {
    code: 'FT-201',
    block: 2,
    text: 'Работает ли в зале приточно-вытяжная вентиляция и обслуживается ли она регулярно?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет / не обслуживается', points: 0 },
    ],
  },
  {
    code: 'FT-202',
    block: 2,
    text: 'Обрабатывается ли инвентарь (тренажёры, маты, коврики) между использованиями клиентами?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да, есть средства и это принято у клиентов/тренеров', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FT-203',
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
    code: 'FT-204',
    block: 2,
    text: 'Собираете ли вы у новых клиентов сведения о противопоказаниях к физической нагрузке перед первым занятием?',
    hint: 'Снижает риск вреда здоровью клиента и вашу ответственность при осложнениях, особенно на персональных/силовых тренировках.',
    showIf: null,
    answers: [
      { label: 'Да, всегда, письменно', points: 1 },
      { label: 'Да, но устно', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 3. Оборудование (всегда) ---
  {
    code: 'FT-301',
    block: 3,
    text: 'Выводится ли неисправное оборудование из эксплуатации сразу (табличка «не работает», физическое ограничение доступа)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да, всегда', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FT-302',
    block: 3,
    text: 'Есть ли сертификаты/декларации соответствия на тренажёры?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FT-303',
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
    code: 'FT-304',
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
  // кроме FT-502/FT-504) ---
  {
    code: 'FT-501',
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
  laborMisrepresentationQuestion('FT', { workerNoun: 'тренеры' }),
  {
    code: 'FT-503',
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
  {
    code: 'FT-504',
    block: 4,
    text: 'Есть ли у ваших тренеров подтверждённое профильное образование или сертификация?',
    hint: 'Прямого штрафа закон не устанавливает, но обязанность привлекать квалифицированных работников есть (ст. 30.1 329-ФЗ) — а главный риск при травме клиента гражданский, не административный.',
    showIf: null,
    answers: [
      { label: 'Да, у всех', points: 1 },
      { label: 'У части', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  personnelReportingQuestion('FT'),

  // --- Блок 5. Персональные данные (всегда) ---
  ...personalDataCoreQuestions('FT', {
    rcnHintExtra: 'Для фитнеса особенно важно: сведения о противопоказаниях/здоровье клиента — специальная категория персональных данных с повышенными требованиями к обработке.',
  }),
  {
    code: 'FT-403',
    block: 5,
    text: 'Оформляются ли письменные согласия клиентов на обработку персональных данных (включая данные о здоровье/противопоказаниях)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не всегда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FT-404',
    block: 5,
    text: 'Берёте ли письменное согласие клиента перед публикацией фото/видео (например, с групповых занятий)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Иногда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ofertaQuestion('FT'),
  marketingConsentQuestion('FT', '406'),

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  ...premisesOperationQuestions('FT'),

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'FT-701',
    block: 7,
    text: 'Используется ли музыка для тренировок/групповых занятий в зале?',
    hint: 'Публичное исполнение музыки требует лицензии (РАО/ВОИС) — риск есть только если она не оформлена.',
    showIf: null,
    answers: [
      { label: 'Нет', points: 1 },
      { label: 'Да, лицензия оформлена', points: 1 },
      { label: 'Да, без лицензии', points: 0 },
    ],
  },
  {
    code: 'FT-702',
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
    code: 'FT-703',
    block: 7,
    text: 'Заключаются ли письменные договоры с подрядчиками и исполнителями?',
    hint: 'Например: клининг, бухгалтерия, маркетинг, приглашённые тренеры со стороны.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не со всеми', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'FT-704',
    block: 7,
    text: 'Есть ли в зале укомплектованная аптечка первой помощи?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Есть, но не проверяю сроки годности', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  // --- Блок 9. Финансовая безопасность (риск блокировки счёта, 115-ФЗ, 01.09.2026) ---
  ...financialSecurityQuestions('FT'),
];

const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'fitness_gym', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
