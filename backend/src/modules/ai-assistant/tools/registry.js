// Реестр инструментов ИИ-ассистента (архитектура задачи 19.08.2026 — первый
// узкий срез). Каждый инструмент — один объект { name, description,
// parameters, validate, buildConfirmation, execute }:
//   - name/description/parameters — то, что уходит модели как OpenAI-style
//     function calling definition (см. listToolDefinitions()).
//   - validate(params) — семантическая проверка ДО подтверждения и ДО
//     записи в БД (например категория обязана быть из фиксированного
//     списка) — JSON Schema в parameters описывает форму для модели, но не
//     заменяет эту проверку на бэкенде: модель вполне может прислать
//     категорию не из enum, доверять ей нельзя.
//   - buildConfirmation(params) — человекочитаемый текст подтверждения на
//     русском, показывается пользователю ПЕРЕД записью.
//   - execute(params, req) — реально пишет в БД. Вызывается ТОЛЬКО из
//     POST /confirm, никогда из /chat.
//
// Когда появится второй инструмент (например create_visit) — он просто
// добавляется в массив REGISTRY ниже со своими validate/buildConfirmation/
// execute; ai-assistant.routes.js, chat-цикл и фронт (AiAssistant.jsx)
// ничего не знают про конкретные инструменты и не требуют переделки.
const { createExpenseEntry } = require('../../finance/expense-entries.service');

// Тот же список, что EXPENSE_CATEGORIES в frontend/src/pages/Finance.jsx и
// CHECK-констрейнт миграции 0080_expense_categories.sql — три места
// пришлось бы держать в синхроне уже сегодня (форма/БД/ассистент), общего
// модуля под это в проекте пока нет нигде (см. тот же выбор в
// expense-entries.routes.js), здесь то же самое, точечное дублирование.
const EXPENSE_CATEGORIES = [
  ['advertising', 'Реклама'],
  ['supplies', 'Расходники'],
  ['rent', 'Аренда'],
  ['utilities', 'Коммунальные'],
  ['accounting_legal', 'Бухгалтерия/юрист'],
  ['equipment_repair', 'Оборудование/ремонт'],
  ['other', 'Прочее'],
];
const EXPENSE_CATEGORY_KEYS = EXPENSE_CATEGORIES.map(([k]) => k);
const EXPENSE_CATEGORY_LABELS = Object.fromEntries(EXPENSE_CATEGORIES);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function money(v) {
  return `${Number(v).toLocaleString('ru-RU')} ₽`;
}

function validateCreateExpense(params) {
  const errors = [];
  const p = params && typeof params === 'object' ? params : {};
  const { amount, category, occurredAt, comment, channel } = p;

  if (amount === undefined || amount === null || amount === '') {
    errors.push('Не указана сумма расхода.');
  } else if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    errors.push('Сумма расхода должна быть положительным числом.');
  }

  if (!category) {
    errors.push('Не указана категория расхода.');
  } else if (!EXPENSE_CATEGORY_KEYS.includes(category)) {
    errors.push(
      `Категория "${category}" не из списка допустимых: ${EXPENSE_CATEGORY_KEYS.map((k) => EXPENSE_CATEGORY_LABELS[k]).join(', ')}.`
    );
  }

  if (occurredAt !== undefined && occurredAt !== null && occurredAt !== '' && !DATE_RE.test(occurredAt)) {
    errors.push('Дата должна быть в формате ГГГГ-ММ-ДД.');
  }

  if (comment !== undefined && comment !== null && typeof comment !== 'string') {
    errors.push('Комментарий должен быть текстом.');
  }

  if (channel !== undefined && channel !== null && channel !== '' && typeof channel !== 'string') {
    errors.push('Канал рекламы должен быть текстом.');
  }

  return { valid: errors.length === 0, errors };
}

// expense_entries.name — NOT NULL (миграция 0004_finance.sql), а параметр
// "комментарий" у инструмента необязателен (ассистент вполне может не
// спросить его, если пользователь и так назвал только сумму+категорию).
// Раз ничего выдумывать нельзя (см. системный промпт), но и пустое поле в
// БД записать нельзя — берём название категории как name, когда комментария
// нет: это не придуманные данные, а буквально то, что пользователь уже
// подтвердил (категорию), просто в роли короткого названия записи — то же
// самое, что человек, скорее всего, ввёл бы в поле "Название" вручную.
function resolveExpenseName(params) {
  const comment = params.comment && params.comment.trim();
  if (comment) return comment;
  return EXPENSE_CATEGORY_LABELS[params.category] || 'Расход';
}

function buildConfirmationCreateExpense(params) {
  const categoryLabel = EXPENSE_CATEGORY_LABELS[params.category] || params.category;
  const dateLabel = params.occurredAt ? new Date(params.occurredAt).toLocaleDateString('ru-RU') : 'сегодняшним числом';
  const parts = [`Записать расход ${money(params.amount)} — категория «${categoryLabel}»`];
  if (params.category === 'advertising' && params.channel) {
    parts.push(`, канал «${params.channel}»`);
  }
  if (params.comment && params.comment.trim()) {
    parts.push(`, комментарий «${params.comment.trim()}»`);
  }
  parts.push(`, ${dateLabel}`);
  return parts.join('') + '. Подтвердить?';
}

async function executeCreateExpense(params, req) {
  const { valid, errors } = validateCreateExpense(params);
  if (!valid) {
    const err = new Error(errors.join(' '));
    err.status = 400;
    throw err;
  }
  return createExpenseEntry({
    companyId: req.tenant.companyId,
    userId: req.user.id,
    name: resolveExpenseName(params),
    amount: params.amount,
    occurredAt: params.occurredAt || null,
    category: params.category,
    channel: params.category === 'advertising' ? (params.channel || null) : null,
  });
}

const REGISTRY = [
  {
    name: 'create_expense',
    description:
      'Внести переменный расход компании (не регулярный/не фиксированный ежемесячный — разовая трата). ' +
      'Категория обязательна и должна быть строго одной из фиксированного списка допустимых значений — ' +
      'если пользователь называет категорию своими словами, подбери ближайшую из списка, а если сомневаешься — переспроси, не угадывай.',
    parameters: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Сумма расхода в рублях, положительное число.',
        },
        category: {
          type: 'string',
          enum: EXPENSE_CATEGORY_KEYS,
          description:
            'Категория расхода, строго одно из значений: ' +
            EXPENSE_CATEGORY_KEYS.map((k) => `${k} (${EXPENSE_CATEGORY_LABELS[k]})`).join(', ') + '.',
        },
        occurredAt: {
          type: 'string',
          description:
            'Дата расхода в формате ГГГГ-ММ-ДД. Указывай это поле, только если пользователь явно назвал дату — ' +
            'если дата не названа, вообще не включай это поле в ответ, будет использована сегодняшняя дата.',
        },
        comment: {
          type: 'string',
          description: 'Короткое описание расхода своими словами пользователя, например "аренда за август" или "визитки". Необязательно.',
        },
        channel: {
          type: 'string',
          description:
            'Только когда category = "advertising": какой именно канал рекламы (Instagram, Яндекс Директ, листовки и т.п.). Для остальных категорий не указывай это поле.',
        },
      },
      required: ['amount', 'category'],
    },
    validate: validateCreateExpense,
    buildConfirmation: buildConfirmationCreateExpense,
    execute: executeCreateExpense,
  },
];

function getTool(name) {
  return REGISTRY.find((t) => t.name === name) || null;
}

// OpenAI/YandexGPT tools-формат для тела запроса к yandexAgent.chat().
function listToolDefinitions() {
  return REGISTRY.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

module.exports = {
  REGISTRY,
  getTool,
  listToolDefinitions,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
};
