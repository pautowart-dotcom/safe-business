// Реестр инструментов ИИ-ассистента (архитектура задачи 19.08.2026, первый
// узкий срез — расширено в тот же день, п.6 плана "постепенно развивать").
// Два вида инструментов:
//
// 1) Пишущие (readOnly не указан/false) — { name, description, parameters,
//    validate, buildConfirmation, execute }:
//   - validate(params) — семантическая проверка ДО подтверждения и ДО
//     записи в БД (JSON Schema в parameters описывает форму для модели, но
//     не заменяет эту проверку на бэкенде — модель может прислать значение
//     не из enum, доверять ей нельзя).
//   - buildConfirmation(params) — человекочитаемый текст подтверждения на
//     русском, показывается пользователю ПЕРЕД записью.
//   - execute(params, req) — реально пишет в БД, возвращает запись.
//     Вызывается ТОЛЬКО из POST /confirm, никогда из /chat.
//
// 2) Читающие (readOnly: true) — { name, description, parameters, execute }:
//   - execute(params, req) — читает данные, возвращает уже готовую строку
//     текстом (не запись БД) — ничего не меняется, поэтому подтверждение не
//     нужно, ai-assistant.routes.js вызывает execute() прямо из /chat и
//     сразу отдаёт результат как type:'text', минуя pending_action/confirm.
//     validate/buildConfirmation не нужны — не пишущий инструмент.
//
// Новый инструмент — просто новый объект в REGISTRY ниже; ai-assistant.routes.js,
// chat-цикл и фронт (AiAssistant.jsx) ничего не знают про конкретные
// инструменты и не требуют переделки.
const { createExpenseEntry } = require('../../finance/expense-entries.service');
const { createRevenueEntry } = require('../../finance/revenue-entries.service');
const pool = require('../../../db/pool');
const { moscowDateStr } = require('../../../utils/moscowDate');
// Кросс-модульный require — то же осознанное исключение из правила
// core/sdk.js ("модуль не импортирует код другого модуля напрямую"), что уже
// задокументировано в expense-entries.service.js, но по другой причине:
// там — чтобы ассистент не мог обойти валидацию записи, здесь —
// computeSecurityStatus() чисто читающая функция, дублировать её (индекс,
// зона, матрица нарушений по нишам) заново было бы намного рискованнее
// (реальный шанс разойтись с "настоящим" числом на экране Безопасности),
// чем один точечный require уже проверенной логики.
const { computeSecurityStatus } = require('../../security/status');

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

// ---------- create_income (19.08.2026, п.3 плана расширения) ----------
// Симметрично create_expense, но без категории — у ручной записи выручки
// (finance_entries, source='manual') категорий нет в схеме вообще.

function validateCreateIncome(params) {
  const errors = [];
  const p = params && typeof params === 'object' ? params : {};
  const { amount, occurredAt, comment } = p;

  if (amount === undefined || amount === null || amount === '') {
    errors.push('Не указана сумма дохода.');
  } else if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    errors.push('Сумма дохода должна быть положительным числом.');
  }
  if (occurredAt !== undefined && occurredAt !== null && occurredAt !== '' && !DATE_RE.test(occurredAt)) {
    errors.push('Дата должна быть в формате ГГГГ-ММ-ДД.');
  }
  if (comment !== undefined && comment !== null && typeof comment !== 'string') {
    errors.push('Комментарий должен быть текстом.');
  }
  return { valid: errors.length === 0, errors };
}

function buildConfirmationCreateIncome(params) {
  const dateLabel = params.occurredAt ? new Date(params.occurredAt).toLocaleDateString('ru-RU') : 'сегодняшним числом';
  const parts = [`Записать доход ${money(params.amount)}`];
  if (params.comment && params.comment.trim()) {
    parts.push(`, комментарий «${params.comment.trim()}»`);
  }
  parts.push(`, ${dateLabel}`);
  return parts.join('') + '. Подтвердить?';
}

async function executeCreateIncome(params, req) {
  const { valid, errors } = validateCreateIncome(params);
  if (!valid) {
    const err = new Error(errors.join(' '));
    err.status = 400;
    throw err;
  }
  return createRevenueEntry({
    companyId: req.tenant.companyId,
    userId: req.user.id,
    amount: params.amount,
    occurredAt: params.occurredAt || null,
    comment: params.comment || null,
  });
}

// ---------- get_finance_summary (19.08.2026, п.2 плана расширения, читающий) ----------
// Осознанно НЕ считает чистую прибыль здесь — та формула сложная
// (постоянные/% расходы, зарплаты мастеров, себестоимость материалов, см.
// finance/summary.routes.js) и дублировать её заново — риск разойтись с
// "настоящим" числом на экране Финансов. Выручка/расходы — простые
// однозначные суммы, дублировать их безопасно; для точной прибыли отправляем
// на сам экран Финансов, а не гадаем.
const PERIOD_LABELS = { today: 'сегодня', week: 'за последние 7 дней', month: 'за этот месяц', lastMonth: 'за прошлый месяц' };

function resolveSimplePeriod(period) {
  const toStr = moscowDateStr();
  const [y, m, d] = toStr.split('-').map(Number);
  const toDateStr = (dt) => dt.toISOString().slice(0, 10);
  if (period === 'lastMonth') {
    return { from: toDateStr(new Date(Date.UTC(y, m - 2, 1))), to: toDateStr(new Date(Date.UTC(y, m - 1, 0))) };
  }
  if (period === 'month') {
    return { from: toDateStr(new Date(Date.UTC(y, m - 1, 1))), to: toStr };
  }
  if (period === 'week') {
    return { from: toDateStr(new Date(Date.UTC(y, m - 1, d - 6))), to: toStr };
  }
  return { from: toStr, to: toStr };
}

// daysAgo (19.08.2026, продолжение того же вечера — владелец: "за последние
// 3 дня" не сработало) — модель сама умеет посчитать, сколько дней назад
// упомянул пользователь ("3 дня" → 3), но НЕ должна сама вычислять
// календарные даты (легко ошибиться на границе месяца/года) — поэтому здесь
// только число дней, дату считает сервер по той же схеме, что и week/month.
function resolveDaysAgoPeriod(daysAgo) {
  const n = Math.min(365, Math.max(1, Math.round(daysAgo)));
  const toStr = moscowDateStr();
  const [y, m, d] = toStr.split('-').map(Number);
  const toDateStr = (dt) => dt.toISOString().slice(0, 10);
  return { from: toDateStr(new Date(Date.UTC(y, m - 1, d - (n - 1)))), to: toStr, days: n };
}

async function executeGetFinanceSummary(params, req) {
  const companyId = req.tenant.companyId;
  let from, to, label;

  const daysAgo = Number(params?.daysAgo);
  if (Number.isFinite(daysAgo) && daysAgo > 0) {
    const resolved = resolveDaysAgoPeriod(daysAgo);
    from = resolved.from;
    to = resolved.to;
    label = `за последние ${resolved.days} дн.`;
  } else {
    const period = ['today', 'week', 'month', 'lastMonth'].includes(params?.period) ? params.period : 'today';
    ({ from, to } = resolveSimplePeriod(period));
    label = PERIOD_LABELS[period];
  }

  const [revenueRes, expenseRes] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM finance_entries WHERE company_id = $1 AND occurred_at BETWEEN $2 AND $3`, [companyId, from, to]),
    pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM expense_entries WHERE company_id = $1 AND occurred_at BETWEEN $2 AND $3`, [companyId, from, to]),
  ]);
  const revenue = parseFloat(revenueRes.rows[0].total);
  const expenses = parseFloat(expenseRes.rows[0].total);

  return (
    `Выручка ${label}: ${money(revenue)}. Переменные расходы: ${money(expenses)}. ` +
    'Это без зарплат мастеров, постоянных расходов и себестоимости материалов — точную чистую прибыль смотрите на экране "Финансы".'
  );
}

// ---------- get_security_status (19.08.2026, п.2 плана расширения, читающий) ----------

async function executeGetSecurityStatus(_params, req) {
  const status = await computeSecurityStatus(req.tenant.companyId);
  if (!status.hasProfile || status.testedNiches.length === 0) {
    return 'Тест безопасности ещё не пройден — загляните в раздел "Безопасность", чтобы увидеть индекс и нарушения.';
  }
  const open = status.violations.filter((v) => v.status === 'open');
  if (open.length === 0) {
    return `Индекс безопасности — ${status.indexPercent}%. Открытых нарушений нет.`;
  }
  const list = open.slice(0, 5).map((v) => `«${v.title}»`).join(', ');
  const more = open.length > 5 ? ` и ещё ${open.length - 5}` : '';
  return `Индекс безопасности — ${status.indexPercent}%. Открытых нарушений: ${open.length} — ${list}${more}. Подробности и как устранить — в разделе "Безопасность".`;
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
  {
    name: 'create_income',
    description: 'Внести ручную запись о выручке (не автоматически из визита — разовое поступление денег, которое пользователь называет сам).',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Сумма дохода в рублях, положительное число.' },
        occurredAt: {
          type: 'string',
          description: 'Дата дохода в формате ГГГГ-ММ-ДД. Указывай, только если пользователь явно назвал дату — иначе не включай поле, будет сегодняшняя дата.',
        },
        comment: { type: 'string', description: 'Короткое описание своими словами пользователя, например "продажа подарочного сертификата". Необязательно.' },
      },
      required: ['amount'],
    },
    validate: validateCreateIncome,
    buildConfirmation: buildConfirmationCreateIncome,
    execute: executeCreateIncome,
  },
  {
    name: 'get_finance_summary',
    description:
      'Узнать выручку и переменные расходы компании за период — читает данные, ничего не меняет. Для стандартных ' +
      'периодов используй period. Для "за последние N дней" своими словами (например "за последние 3 дня") используй ' +
      'daysAgo=N вместо period — НЕ пытайся сам вычислить календарные даты, просто передай число дней, сервер посчитает сам.',
    readOnly: true,
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'week', 'month', 'lastMonth'],
          description: 'Период: today (сегодня, по умолчанию), week (последние 7 дней), month (этот месяц), lastMonth (прошлый месяц). Не указывай вместе с daysAgo.',
        },
        daysAgo: {
          type: 'number',
          description: 'Произвольное число дней назад от сегодня (например 3 для "за последние 3 дня"). Если указано — period игнорируется.',
        },
      },
    },
    execute: executeGetFinanceSummary,
  },
  {
    name: 'get_security_status',
    description: 'Узнать индекс безопасности компании и список открытых (неустранённых) нарушений теста безопасности — читает данные, ничего не меняет.',
    readOnly: true,
    parameters: { type: 'object', properties: {} },
    execute: executeGetSecurityStatus,
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
