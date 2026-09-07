const pool = require('../db/pool');
const { getPatentRate } = require('./patentRates');

// Фиксированные страховые взносы ИП "за себя" — единая сумма (без деления
// на ОПС/ОМС), устанавливается государством на КАЖДЫЙ год отдельно (п. 1.2
// ст. 430 НК РФ). Значение на 2026 год — 57 390 ₽, сверено 28.08.2026
// (WebSearch: e-kontur.ru/enquiry/29, regberry.ru). МЕНЯЕТСЯ ЕЖЕГОДНО —
// это входит в зону ответственности law-compliance-monitor (расширена на
// этот модуль вместе с patent_rates, см. план §6) — не переносить на
// следующий год без проверки.
const FIXED_INSURANCE_CONTRIBUTION_RUB = 57_390;

// Порог допвзноса 1% с дохода свыше 300 000 ₽ (тот же порог, что уже
// используется в taxDeadlines.js для insurance_extra) — стабилен уже
// несколько лет, в отличие от фиксированной суммы выше.
const EXTRA_CONTRIBUTION_THRESHOLD_RUB = 300_000;

// Верхний предел допвзноса 1% (05.09.2026, найдено при аудите
// law-compliance-monitor: до этой правки доплата считалась БЕЗ потолка,
// завышая расчёт для высокой выручки) — по ст. 430 НК РФ ограничен
// восьмикратным размером фиксированной части взносов на ОПС. Сумма ниже
// сверена тремя независимыми вторичными источниками (regberry.ru,
// astral.ru, moedelo.org) на 2026 год, но не первоисточником НК РФ —
// требует проверки юристом, как и FIXED_INSURANCE_CONTRIBUTION_RUB выше,
// и так же меняется ежегодно.
const MAX_EXTRA_CONTRIBUTION_RUB = 321_818;

function computeInsuranceContribution(revenue) {
  const rawExtra = revenue > EXTRA_CONTRIBUTION_THRESHOLD_RUB ? Math.round((revenue - EXTRA_CONTRIBUTION_THRESHOLD_RUB) * 0.01) : 0;
  const extra = Math.min(rawExtra, MAX_EXTRA_CONTRIBUTION_RUB);
  return FIXED_INSURANCE_CONTRIBUTION_RUB + extra;
}

async function computeYearToDateFinance(companyId, year) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const [{ rows: revenueRows }, { rows: expenseRows }] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM finance_entries
       WHERE company_id = $1 AND occurred_at >= $2 AND occurred_at <= LEAST($3::date, CURRENT_DATE)`,
      [companyId, from, to]
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expense_entries
       WHERE company_id = $1 AND occurred_at >= $2 AND occurred_at <= LEAST($3::date, CURRENT_DATE)`,
      [companyId, from, to]
    ),
  ]);
  return { revenue: Number(revenueRows[0].total), expenses: Number(expenseRows[0].total) };
}

// УСН "Доходы" (6%) — налог можно уменьшить на уплаченные страховые взносы:
// ИП без сотрудников — вплоть до нуля, с сотрудниками — не более чем
// наполовину (п. 3.1 ст. 346.21 НК РФ).
function estimateUsnIncome(revenue, insuranceContribution, hasEmployees) {
  const grossTax = Math.round(revenue * 0.06);
  const maxDeduction = hasEmployees ? Math.round(grossTax / 2) : grossTax;
  const deduction = Math.min(insuranceContribution, maxDeduction);
  return Math.max(grossTax - deduction, 0);
}

// УСН "Доходы минус расходы" (15%) — минимальный налог 1% от выручки, если
// обычный расчёт вышел меньше (п. 6 ст. 346.18 НК РФ). Взносы отдельно не
// вычитаем — они уже часть expense_entries, если компания их туда вносит.
//
// expensesDocumented === false (07.09.2026, проверено law-compliance-monitor,
// ст. 346.16 + п.1 ст.252 НК РФ) — расход принимается налоговой только если
// он одновременно в закрытом перечне, оплачен и документально подтверждён
// (чек/накладная/договор). Неофициальный процент мастеру наличными без
// оформления под это не подходит: считать такой ввод как реальный расход
// режима "Доходы минус расходы" значит показать заниженный, недостижимый
// налог. В этом случае режим не считаем вовсе (estimatedTaxRub: null),
// вместо цифры — предупреждение (см. вызывающий код). undefined (старая
// когорта, автоматический расчёт из finance_entries — my-deadlines.routes.js
// не передаёт этот параметр) ведёт себя как раньше, без изменений.
function estimateUsnIncomeExpense(revenue, expenses, expensesDocumented) {
  if (expensesDocumented === false) return null;
  const regular = Math.round(Math.max(revenue - expenses, 0) * 0.15);
  const minimum = Math.round(revenue * 0.01);
  return Math.max(regular, minimum);
}

// Рекомендатель системы налогообложения (Фаза 3) — сравнивает варианты по
// РЕАЛЬНЫМ данным компании с начала текущего года (finance_entries/
// expense_entries), не гадает и не проецирует на весь год: честная цифра
// "если бы вы были на этом режиме с начала года при уже реальной выручке",
// не прогноз будущего. ОСН сознательно не считаем (подтверждено владельцем
// 28.08.2026) — статичное пояснение вместо расчёта.
//
// manualFinance (06.09.2026, ИИ-агент по налогам) — у новой когорты
// ("только безопасность") нет модуля finance, значит нет ни одной строки в
// finance_entries/expense_entries: computeYearToDateFinance для них всегда
// вернул бы 0/0, что выглядело бы как "у вас нулевая выручка" вместо
// честного "мы не знаем вашу выручку". Разговорный агент вместо этого
// СПРАШИВАЕТ выручку/расходы напрямую и передаёт их сюда явно — расчёт
// остаётся тем же самым детерминированным кодом, ИИ не считает налоги сам,
// только собирает недостающие входные данные и объясняет готовый результат.
async function recommendTaxRegime({ companyId, regionCode, niche, hasEmployees, manualFinance, expensesDocumented }) {
  const year = new Date().getFullYear();
  const { revenue, expenses } = manualFinance || (await computeYearToDateFinance(companyId, year));
  const insuranceContribution = computeInsuranceContribution(revenue);

  const patentRate = regionCode && niche
    ? await getPatentRate({ regionCode, niche, year })
    : { status: 'unknown_region' };

  const options = [
    {
      regime: 'usn_income',
      label: 'УСН «Доходы» (6%)',
      estimatedTaxRub: estimateUsnIncome(revenue, insuranceContribution, !!hasEmployees),
      note: 'Налог уменьшен на уплаченные страховые взносы (без сотрудников — вплоть до нуля, с сотрудниками — не более чем наполовину).',
    },
    {
      regime: 'usn_income_expense',
      label: 'УСН «Доходы минус расходы» (15%)',
      estimatedTaxRub: estimateUsnIncomeExpense(revenue, expenses, expensesDocumented),
      note: expensesDocumented === false
        ? 'Расходы для этого режима налоговая принимает только по документам (чеки, договоры, ведомости). Если платите мастерам процент наличными без оформления — эту сумму нельзя учесть, и расчёт по факту окажется выше показанного.'
        : 'С минимальным налогом 1% от выручки, если обычный расчёт вышел меньше.',
    },
    {
      regime: 'patent',
      label: 'Патент (ПСН)',
      estimatedTaxRub: patentRate.status === 'found' ? patentRate.amount : null,
      note: patentRate.status === 'found'
        ? (patentRate.reviewed ? null : 'Ставка ещё не проверена юристом — сверьте перед решением.')
        : 'Ставка для вашего региона/ниши пока не найдена в базе — уточните на сайте ФНС (patent.nalog.ru/info/).',
    },
    {
      regime: 'osn',
      label: 'ОСН (общая система)',
      estimatedTaxRub: null,
      note: 'Не считаем — обычно невыгоден для малого бизнеса без НДС-контрагентов. Обсудите с бухгалтером, если работаете с крупными компаниями на НДС.',
    },
  ];

  const computed = options.filter((o) => o.estimatedTaxRub != null);
  const cheapest = computed.length > 0 ? computed.reduce((a, b) => (b.estimatedTaxRub < a.estimatedTaxRub ? b : a)) : null;

  return {
    year,
    revenue,
    expenses,
    insuranceContribution,
    options,
    cheapestRegime: cheapest?.regime || null,
  };
}

module.exports = { recommendTaxRegime, computeInsuranceContribution, FIXED_INSURANCE_CONTRIBUTION_RUB };
