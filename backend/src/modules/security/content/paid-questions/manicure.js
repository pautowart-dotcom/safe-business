// Платный аудит, ниша "Маникюр и педикюр" — единственная ниша с готовым платным
// контентом на MVP. Источник: docs/security-engine/06_Paid_Audit_FINAL.md —
// единственный источник правды для вопросов платного теста (Файл 01 §15).
// Баллы по умолчанию: первый ответ=1, второй=0,5, третий=0 (Файл 09 §1);
// явные "points" в ответах ниже — переопределение по описанным в Файле 06
// исключениям (MN-103, MN-203, MN-205, MN-502, MN-606).
//
// Количество вопросов НЕ фиксируется числом (Файл 06, "Количество вопросов —
// программная логика") — оно всегда count(вопросы, где isVisible(showIf)),
// см. content/visibility.js.

const QUESTIONS = [
  // --- Блок 1. Юридическая база (всегда) ---
  {
    code: 'MN-101',
    block: 1,
    text: 'Указано ли в договоре аренды, что помещение используется для оказания услуг маникюра и педикюра?',
    hint: 'Назначение помещения должно соответствовать фактическому использованию.',
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'MN-102',
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
    code: 'MN-103',
    block: 1,
    text: 'Можете ли вы принимать оплату банковской картой (терминал, QR-эквайринг)?',
    hint: 'Обязательно при выручке от 5 млн ₽/год — отказ от приёма карт может повлечь штраф по жалобе клиента.',
    showIf: null,
    answers: [
      { label: 'Да, есть терминал/QR', points: 1 },
      { label: 'Выручка не требует эквайринга', points: 1 },
      { label: 'Нет, принимаю только наличные', points: 0 },
    ],
  },

  // --- Блок 2. Санитарная безопасность (всегда) ---
  {
    code: 'MN-201',
    block: 2,
    text: 'Ведётся ли журнал стерилизации инструментов?',
    hint: 'Один из первых документов, который могут запросить.',
    showIf: null,
    answers: [
      { label: 'Да, регулярно', points: 1 },
      { label: 'Нерегулярно', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'MN-202',
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
    code: 'MN-203',
    block: 2,
    text: 'Если возникают порезы и контакт с кровью, заключён ли договор на вывоз отходов класса Б?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      // Особая логика (Файл 06/09): при этом ответе нарушение не создаётся
      // независимо от баллов — рисков нет, т.к. контакта с кровью физически нет.
      { label: 'Контакта с кровью нет', points: 1 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'MN-204',
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
    code: 'MN-205',
    block: 2,
    text: 'Ведётся ли журнал работы рециркулятора?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Нет журнала', points: 0 },
      // Особая логика (Файл 06/09/10): если рециркулятора нет вовсе — это
      // отдельное нарушение MN-206-доп, а не "нет журнала" MN-205.
      { label: 'Рециркулятора нет', points: 0, violationCodeOverride: 'MN-206-доп' },
    ],
  },
  {
    code: 'MN-206',
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
    code: 'MN-207',
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
    code: 'MN-208',
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
    code: 'MN-209',
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
    code: 'MN-301',
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
    code: 'MN-302',
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
    code: 'MN-303',
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
    code: 'MN-304',
    block: 3,
    text: 'Есть ли сертификаты на используемые материалы и косметику?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'На всё', points: 1 },
      { label: 'На часть', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'MN-305',
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
  // кроме MN-502 — см. content/visibility.js) ---
  {
    code: 'MN-501',
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
  {
    code: 'MN-502',
    block: 4,
    text: 'Каким образом оформлены специалисты, работающие в вашем помещении?',
    hint: 'Разные форматы сотрудничества требуют разных документов и несут разные риски при проверках.',
    showIf: 'not_alone',
    answers: [
      { label: 'Трудовой договор', points: 1 },
      { label: 'Аренда рабочего места', points: 1 },
      { label: 'Самозанятый/ГПХ', points: 0.5 },
      { label: 'Не уверен', points: 0 },
    ],
  },
  {
    code: 'MN-503',
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
    code: 'MN-504',
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

  // --- Блок 5. Персональные данные (всегда) ---
  {
    code: 'MN-401',
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
    code: 'MN-402',
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
    code: 'MN-403',
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
    code: 'MN-404',
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

  // --- Блок 6. Эксплуатация помещения (всегда) ---
  {
    code: 'MN-601',
    block: 6,
    text: 'Заключён ли договор на вывоз твёрдых бытовых отходов?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'MN-602',
    block: 6,
    text: 'Назначен ли приказом ответственный за пожарную безопасность?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'MN-603',
    block: 6,
    text: 'Есть ли актуальный план эвакуации, размещённый в помещении?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Частично', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'MN-604',
    block: 6,
    text: 'Ведётся ли журнал контроля огнетушителей?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'MN-605',
    block: 6,
    text: 'Есть ли актуальные акты проверки огнетушителей?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не уверен', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
  {
    code: 'MN-606',
    block: 6,
    text: 'Оборудовано ли помещение автоматической пожарной сигнализацией, и есть ли договор на её техническое обслуживание?',
    hint: 'Требование зависит от площади и категории помещения — если сигнализация не требуется по нормам, выберите соответствующий вариант.',
    showIf: null,
    answers: [
      { label: 'Да, сигнализация есть и обслуживается', points: 1 },
      { label: 'Сигнализация не требуется для нашего помещения', points: 1 },
      { label: 'Нет сигнализации или нет обслуживания', points: 0 },
    ],
  },

  // --- Блок 7. Дополнительные зоны внимания (всегда) ---
  {
    code: 'MN-701',
    block: 7,
    text: 'Используется ли музыка для клиентов в помещении студии?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Нет', points: 1 },
      { label: 'Да, но вопрос не проверял', points: 0.5 },
      { label: 'Да', points: 0 },
    ],
  },
  {
    code: 'MN-702',
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
    code: 'MN-703',
    block: 7,
    text: 'Заключаются ли письменные договоры с подрядчиками и исполнителями?',
    hint: null,
    showIf: null,
    answers: [
      { label: 'Да', points: 1 },
      { label: 'Не со всеми', points: 0.5 },
      { label: 'Нет', points: 0 },
    ],
  },
];

// Блок обратной связи после аудита (Файл 06) — не влияет на баллы, отдельно
// сохраняется в security_feedback.
const FEEDBACK_OPTIONS = [
  'Готовые документы',
  'Проверенные подрядчики',
  'Сопровождение под ключ',
  'Подготовка к проверке',
  'Обновления законодательства',
  'Другое',
];

module.exports = { niche: 'manicure', questions: QUESTIONS, feedbackOptions: FEEDBACK_OPTIONS };
