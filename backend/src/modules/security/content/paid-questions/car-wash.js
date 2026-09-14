// Платный аудит, ниша "Автомойка" — первая ниша сегмента "Услуги для
// автомобилей". Блоки 4 (кроме CW-501/504), 5 (кроме CW-403/404), 6, 9
// идентичны остальным нишам бытовых/сервисных услуг (см.
// violations/car-wash.js — та же нормативная база и штрафы). CW-102/106/107,
// CW-201..204, CW-301..304, CW-403/404, CW-701/702, CW-801 — новый контент
// под специфику ниши, источники — см. комментарий в шапке
// violations/car-wash.js.

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
    code: 'CW-101',
    block: 1,
    text: 'Подтверждено ли документами на помещение/территорию (договором аренды или сведениями ЕГРН), что использование под автомойку допускается?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'CW-102',
    block: 1,
    text: 'Находится ли мойка на расстоянии не менее 50 метров от жилой застройки?',
    hint: 'Минимальная санитарно-защитная зона для этого вида деятельности.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет / ближе', points: 0 },
    ],
  },
  {
    code: 'CW-103',
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
    code: 'CW-104',
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
    code: 'CW-105',
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
    code: 'CW-106',
    block: 1,
    text: 'Осматривается ли автомобиль при приёме на предмет уже имеющихся повреждений?',
    hint: 'Защищает от необоснованных претензий о повреждениях, возникших до мойки.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Иногда', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'CW-107',
    block: 1,
    text: 'Проверяли ли вы, не попадает ли участок мойки в границы водоохранной зоны?',
    hint: 'Актуально в первую очередь для мобильных моек и точек у водоёмов.',
    showIf: null,
    answers: [
      { label: 'Да, не попадает', points: 1 },
      { label: 'Не проверял(а)', points: 0.5 },
      { label: 'Попадает / не уверен(а)', points: 0 },
    ],
  },

  // --- Блок 2. Очистка сточных вод и производственный контроль (всегда) ---
  {
    code: 'CW-201',
    block: 2,
    text: 'Установлен ли нефтеуловитель (маслобензоотделитель) или система оборотного водоснабжения?',
    hint: 'Сброс в канализацию без очистки от нефтепродуктов запрещён — это самый значимый риск ниши.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'CW-202',
    block: 2,
    text: 'Заключён ли договор на регулярный вывоз уловленных нефтепродуктов и осадка?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'CW-203',
    block: 2,
    text: 'Организован ли производственный контроль (анализ сточных вод, оценка условий труда)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'CW-204',
    block: 2,
    text: 'Хранятся ли моющие химикаты в герметичной промаркированной таре, отдельно от зоны обслуживания клиентов?',
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
    code: 'CW-301',
    block: 3,
    text: 'Есть ли сертификаты/декларации соответствия на оборудование (аппараты высокого давления, компрессоры)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'CW-302',
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
    code: 'CW-303',
    block: 3,
    text: 'Оформлены ли акты ввода оборудования в эксплуатацию и организовано ли ТО аппаратов высокого давления?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'CW-304',
    block: 3,
    text: 'Обеспечен ли персонал средствами индивидуальной защиты (водонепроницаемая одежда, перчатки)?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },

  // --- Блок 4. Персонал (показывается только при наличии сотрудников,
  // кроме CW-504) ---
  {
    code: 'CW-501',
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
  laborMisrepresentationQuestion('CW', { workerNoun: 'мойщики' }),
  medicalBooksQuestion('CW'),
  {
    code: 'CW-504',
    block: 4,
    text: 'Ведётся ли журнал инструктажа сотрудников, включая работу с аппаратами высокого давления и химикатами?',
    hint: null,
    showIf: 'has_employees',
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  personnelReportingQuestion('CW'),

  // --- Блок 5. Персональные данные (всегда) ---
  ...personalDataCoreQuestions('CW'),
  {
    code: 'CW-403',
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
    code: 'CW-404',
    block: 5,
    text: 'Берёте ли письменное согласие клиента перед публикацией фото/видео автомобиля (с номерным знаком)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Иногда / размываем номер', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  ofertaQuestion('CW'),
  marketingConsentQuestion('CW', '406'),

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  ...premisesOperationQuestions('CW'),

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'CW-701',
    block: 7,
    text: 'Зарегистрирован ли товарный знак или бренд автомойки?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Планирую', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'CW-702',
    block: 7,
    text: 'Заключаются ли письменные договоры с подрядчиками (обслуживание нефтеуловителя, поставщики химии)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не со всеми', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'CW-801',
    block: 8,
    text: 'Предупреждаете ли клиента заранее об ограничениях результата (глубокие царапины, застарелые пятна)?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Только в явных случаях', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  // --- Блок 9. Финансовая безопасность (риск блокировки счёта, 115-ФЗ, 01.09.2026) ---
  ...financialSecurityQuestions('CW'),
];

const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'car_wash', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
