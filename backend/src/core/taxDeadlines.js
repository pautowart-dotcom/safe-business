const pool = require('../db/pool');
const { registerDeadline } = require('./deadlines');

// ВАЖНО — даты и сама применимость правил ниже реализованы по общим
// ориентирам для ИП на популярных режимах и МОГУТ БЫТЬ НЕТОЧНЫМИ для
// конкретной компании (организационная форма, регион, льготы, изменения
// законодательства). Перед реальным использованием обязательно сверить
// список с бухгалтером/юристом — это ориентир, не источник истины.
const TAX_REGIMES = [
  { key: 'self_employed', label: 'Самозанятость (НПД)' },
  { key: 'patent', label: 'Патент (ПСН)' },
  { key: 'usn_income', label: 'УСН «Доходы» (6%)' },
  { key: 'usn_income_expense', label: 'УСН «Доходы минус расходы» (15%)' },
  { key: 'osn', label: 'ОСН (общая система)' },
];

// Конец соответствующего квартала — используется, чтобы не создавать
// напоминание о периоде, который целиком закончился ДО регистрации ИП
// (например, ИП открыт в августе — кварталы 1 и 2 к нему не относятся,
// а 3-й, в который попадает август, относится). Это не "предсказание"
// даты (которое нам запрещено), а чистая календарная арифметика.
const QUARTER_END = {
  q1: (year) => `${year}-03-31`,
  q2: (year) => `${year}-06-30`,
  q3: (year) => `${year}-09-30`,
  q4: (year) => `${year}-12-31`,
};

// Начало квартала — нужно, чтобы считать "Резерв на налоги" (см.
// computeReserve ниже): сумму выручки/расходов берём с начала квартала,
// а не за весь год.
const QUARTER_START = {
  q1: (year) => `${year}-01-01`,
  q2: (year) => `${year}-04-01`,
  q3: (year) => `${year}-07-01`,
  q4: (year) => `${year}-10-01`,
};

// Слоты, общие для всех известных режимов, специфичные — только для тех
// регимов, где сроки достаточно стандартны, чтобы их можно было посчитать
// без доп. данных (например, оплата патента зависит от даты начала и
// срока действия конкретного патента, которых мы не храним — поэтому для
// 'patent' генерируются только общие для ИП взносы, без специфики самого
// патента; отметку об оплате патента компания ведёт сама, через "Готово").
//
// ipRegisteredAt/hasEmployees — необязательные исходные данные из вкладки
// "Мои сроки" (Пакет 4, Этап 2): ipRegisteredAt отсекает уже прошедшие на
// момент регистрации кварталы, hasEmployees добавляет отчётность за
// сотрудников (РСВ/6-НДФЛ), независимую от налогового режима.
function computeSlots(regime, year, { ipRegisteredAt = null, hasEmployees = false } = {}) {
  // Самозанятость (НПД) — отдельный режим без фиксированных страховых
  // взносов ИП и без квартальных авансов: налог считается и удерживается
  // автоматически по каждой операции в приложении "Мой налог" ФНС, этот
  // движок им не управляет. По 422-ФЗ самозанятому нельзя иметь сотрудников
  // (это один из триггеров перехода на ИП, см. businessStatusTriggers.js),
  // поэтому и слоты по сотрудникам здесь не создаются.
  if (regime === 'self_employed') return {};

  const slots = {};

  // Взносы/налог по режиму — только если режим известен (как и раньше:
  // без выбранного режима непонятно, ИП ли это вообще и на каких условиях).
  if (regime) {
    // Фиксированные страховые взносы ИП "за себя" — единый срок для всех
    // режимов, кроме ОСН для юрлиц (для простоты считаем ИП-контекст,
    // отмечено в дисклеймере выше). Дата исправлена 28.08.2026 (сверено
    // WebSearch при разработке taxRegimeRecommender.js) — было 31 декабря
    // по старым правилам, после реформы ЕНП 2023 года срок сдвинут на
    // 28 декабря (п. 2 ст. 432 НК РФ), как и авансы УСН ниже (те уже были
    // поправлены 04.08.2026, этот слот тогда пропустили).
    slots.insurance_fixed = {
      title: `Фиксированные страховые взносы ИП за ${year} год — сверьте сумму с ФНС`,
      dueDate: `${year}-12-28`,
    };
    // 1% с дохода свыше 300 000 ₽ за прошедший год — срок в следующем году.
    slots.insurance_extra = {
      title: `Доплата 1% страховых взносов с дохода свыше 300 000 ₽ за ${year} год`,
      dueDate: `${year + 1}-07-01`,
    };

    if (regime === 'usn_income' || regime === 'usn_income_expense') {
      // Даты актуализированы 04.08.2026 (law-compliance-monitor) под реформу
      // ЕНП 2023 года: сам платёж по авансу — 28-е число (25-е — срок подачи
      // отдельного уведомления об исчисленных суммах, не платежа); годовая
      // декларация УСН для ИП — 25 апреля, не 30-е (для организаций — 25
      // марта, но продукт ориентирован на ИП). Точный сдвиг на выходные/
      // праздники конкретного года (например 27/27/26 в 2026-м) намеренно
      // не считаем — см. дисклеймер в шапке файла, "сверьте с бухгалтером".
      slots.usn_q1 = { title: `УСН: авансовый платёж за 1 квартал ${year}`, dueDate: `${year}-04-28`, quarterStart: QUARTER_START.q1(year), quarterEnd: QUARTER_END.q1(year) };
      slots.usn_q2 = { title: `УСН: авансовый платёж за полугодие ${year}`, dueDate: `${year}-07-28`, quarterStart: QUARTER_START.q2(year), quarterEnd: QUARTER_END.q2(year) };
      slots.usn_q3 = { title: `УСН: авансовый платёж за 9 месяцев ${year}`, dueDate: `${year}-10-28`, quarterStart: QUARTER_START.q3(year), quarterEnd: QUARTER_END.q3(year) };
      slots.usn_annual = { title: `УСН: итоговый налог и декларация за ${year} год`, dueDate: `${year + 1}-04-25`, quarterStart: QUARTER_START.q4(year), quarterEnd: QUARTER_END.q4(year) };
    }
  }

  // Отчётность за сотрудников — обязанность работодателя, не зависит от
  // налогового режима, поэтому генерируется отдельно по одному hasEmployees.
  if (hasEmployees) {
    slots.emp_q1 = { title: `Отчётность за сотрудников (РСВ, 6-НДФЛ) за 1 квартал ${year}`, dueDate: `${year}-04-25`, quarterEnd: QUARTER_END.q1(year) };
    slots.emp_q2 = { title: `Отчётность за сотрудников (РСВ, 6-НДФЛ) за полугодие ${year}`, dueDate: `${year}-07-25`, quarterEnd: QUARTER_END.q2(year) };
    slots.emp_q3 = { title: `Отчётность за сотрудников (РСВ, 6-НДФЛ) за 9 месяцев ${year}`, dueDate: `${year}-10-25`, quarterEnd: QUARTER_END.q3(year) };
    // Годовые РСВ и 6-НДФЛ актуализированы 04.08.2026 — раньше были слиты в
    // один слот с одной датой (25 февраля), но у них разные сроки: РСВ за
    // год — до 25 января следующего года, 6-НДФЛ за год — до 25 февраля.
    // emp_annual сохранил старый ключ (без изменения related_entity_type,
    // чтобы не плодить осиротевшие записи в deadlines у уже настроивших
    // сроки компаний) и стал более ранним, РСВ-сроком; 6-НДФЛ — новый слот.
    slots.emp_annual = { title: `Отчётность за сотрудников (РСВ) за ${year} год`, dueDate: `${year + 1}-01-25`, quarterEnd: QUARTER_END.q4(year) };
    slots.emp_annual_6ndfl = { title: `Отчётность за сотрудников (6-НДФЛ) за ${year} год`, dueDate: `${year + 1}-02-25`, quarterEnd: QUARTER_END.q4(year) };
  }

  if (ipRegisteredAt) {
    for (const key of Object.keys(slots)) {
      if (slots[key].quarterEnd && ipRegisteredAt > slots[key].quarterEnd) delete slots[key];
    }
  }

  return slots;
}

const ALL_SLOT_KEYS = [
  'insurance_fixed', 'insurance_extra',
  'usn_q1', 'usn_q2', 'usn_q3', 'usn_annual',
  'emp_q1', 'emp_q2', 'emp_q3', 'emp_annual', 'emp_annual_6ndfl',
];

// Пересчитывает налоговые дедлайны компании под текущий режим/исходные
// данные и текущий календарный год. Вызывается при сохранении налоговых
// настроек на вкладке "Мои сроки". Смены года без повторного захода в
// настройки не отслеживаются — тут нет плановой задачи (cron), которая
// перегенерировала бы сроки на новый год автоматически; это ограничение
// MVP, а не намеренное решение.
async function syncTaxDeadlines(companyId, regime, { ipRegisteredAt = null, hasEmployees = false } = {}) {
  const year = new Date().getFullYear();
  const desired = computeSlots(regime, year, { ipRegisteredAt, hasEmployees });

  for (const slotKey of ALL_SLOT_KEYS) {
    const relatedEntityType = `tax:${slotKey}`;
    if (desired[slotKey]) {
      await registerDeadline({
        companyId,
        category: 'tax',
        title: desired[slotKey].title,
        dueDate: desired[slotKey].dueDate,
        relatedEntityType,
        relatedEntityId: companyId,
      });
    } else {
      await pool.query('DELETE FROM deadlines WHERE company_id = $1 AND related_entity_type = $2 AND related_entity_id = $3', [
        companyId,
        relatedEntityType,
        companyId,
      ]);
    }
  }
}

// "Резерв на налоги" — ориентировочная сумма к отложенному конкретному
// квартальному авансу УСН, посчитанная по уже внесённой в компании
// выручке (и расходам для "доходы минус расходы") с начала квартала по
// сегодня. Официальный расчёт авансов УСН — нарастающим итогом с начала
// года за вычетом ранее уплаченных сумм, здесь — упрощение по выручке
// ТОЛЬКО текущего квартала (близко к реальной доплате в обычном случае,
// но не тождественно ей) — поэтому строго "ориентировочно", не итоговая
// сумма к уплате. Не учитывает вычет по страховым взносам (usn_income) и
// минимальный налог 1% (актуален только для годовой декларации, которую
// этот расчёт не покрывает).
async function computeReserve(companyId, regime, quarterStart, quarterEnd) {
  const { rows: revenueRows } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM finance_entries
     WHERE company_id = $1 AND occurred_at >= $2 AND occurred_at <= LEAST($3::date, CURRENT_DATE)`,
    [companyId, quarterStart, quarterEnd]
  );
  const revenue = Number(revenueRows[0].total);

  if (regime === 'usn_income') {
    return { revenue, expenses: null, amount: Math.round(revenue * 0.06) };
  }

  const { rows: expenseRows } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM expense_entries
     WHERE company_id = $1 AND occurred_at >= $2 AND occurred_at <= LEAST($3::date, CURRENT_DATE)`,
    [companyId, quarterStart, quarterEnd]
  );
  const expenses = Number(expenseRows[0].total);
  const amount = Math.round(Math.max(revenue - expenses, 0) * 0.15);
  return { revenue, expenses, amount };
}

// Скользящее окно 12 месяцев — для триггера самозанятый→ИП: лимит НПД
// (2 400 000 ₽) годовой, а не квартальный, как "Резерв на налоги" выше,
// поэтому не переиспользуем quarterStart/quarterEnd, хотя SQL-форма та же.
// ВАЖНО (для формулировки в интерфейсе, не для сокрытия): finance_entries —
// это то, что компания сама внесла (auto_from_visit/manual), не сверено с
// банком. Если самозанятый не ведёт выручку в приложении, число ниже
// ЗАНИЖАЕТ реальный доход — UI, который это использует, обязан честно об
// этом говорить, а не подразумевать точность, которой нет.
async function computeTrailingRevenue(companyId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM finance_entries
     WHERE company_id = $1 AND occurred_at >= (CURRENT_DATE - INTERVAL '12 months') AND occurred_at <= CURRENT_DATE`,
    [companyId]
  );
  return Number(rows[0].total);
}

// График оплаты патента (ПСН) по уже известной владельцу сумме (сумму мы
// не считаем — она зависит от региона/ниши/года, см. комментарий в
// my-deadlines.routes.js). Правила фиксированы федерально (ст. 346.51 НК
// РФ), не зависят от региона/ниши:
// - патент на срок до 6 месяцев — вся сумма не позднее даты окончания;
// - патент на срок от 6 до 12 месяцев — 1/3 не позднее 90 календарных
//   дней после начала действия, остальные 2/3 — не позднее даты окончания.
function addDaysUTC(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Отнять N рабочих дней от даты — упрощённо, только выходные (суббота/
// воскресенье), без учёта официальных праздников/переносов производственного
// календаря РФ (владелец подтвердил упрощение для v1, 28.08.2026) — как и
// остальные даты в этом модуле, с дисклеймером "сверьте точную дату" в UI,
// не как источник истины.
function subtractWorkingDaysUTC(dateStr, workingDays) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  let remaining = workingDays;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    const day = d.getUTCDay(); // 0 = воскресенье, 6 = суббота
    if (day !== 0 && day !== 6) remaining--;
  }
  return d.toISOString().slice(0, 10);
}

function monthsBetweenInclusive(startAt, endAt) {
  const s = new Date(`${startAt}T00:00:00Z`);
  const e = new Date(`${endAt}T00:00:00Z`);
  return (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth()) + 1;
}

function computePatentSchedule(startAt, endAt, amount) {
  const months = monthsBetweenInclusive(startAt, endAt);
  if (months < 6) {
    return [{ label: 'Вся стоимость патента', dueDate: endAt, amount }];
  }
  const first = Math.round(amount / 3);
  return [
    { label: '1/3 стоимости патента', dueDate: addDaysUTC(startAt, 90), amount: first },
    { label: 'Оставшиеся 2/3 стоимости патента', dueDate: endAt, amount: amount - first },
  ];
}

module.exports = { TAX_REGIMES, syncTaxDeadlines, computeSlots, computeReserve, computeTrailingRevenue, computePatentSchedule, subtractWorkingDaysUTC };
