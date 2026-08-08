const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { moscowDateStr } = require('../../utils/moscowDate');

const router = express.Router();

const toDateStr = (d) => d.toISOString().slice(0, 10);

// Пресеты Этапа 6: сегодня / неделя (скользящее окно, 7 дней) / месяц
// (текущий календарный, с 1-го числа) / прошлый месяц (полный календарный).
// dateFrom/dateTo в запросе — произвольный диапазон, переопределяет period.
// Раньше "сегодня" бралось как new Date() — календарный день по часовому
// поясу ПРОЦЕССА (сервер в UTC), а не студии (Москва) — см. utils/moscowDate.js
// и тот же класс бага в dashboard.routes.js.
function resolvePeriod(query) {
  if (query.dateFrom && query.dateTo) {
    return { from: query.dateFrom, to: query.dateTo };
  }

  const toStr = moscowDateStr();
  const [y, m, d] = toStr.split('-').map(Number);

  if (query.period === 'lastMonth') {
    const lastMonthEnd = new Date(Date.UTC(y, m - 1, 0));
    const lastMonthStart = new Date(Date.UTC(y, m - 2, 1));
    return { from: toDateStr(lastMonthStart), to: toDateStr(lastMonthEnd) };
  }

  if (query.period === 'month') {
    const monthStart = new Date(Date.UTC(y, m - 1, 1));
    return { from: toDateStr(monthStart), to: toStr };
  }

  if (query.period === 'week') {
    const weekStart = new Date(Date.UTC(y, m - 1, d - 6));
    return { from: toDateStr(weekStart), to: toStr };
  }

  return { from: toStr, to: toStr };
}

const round2 = (n) => Math.round(n * 100) / 100;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { from, to } = resolvePeriod(req.query);
    const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
    const companyId = req.tenant.companyId;

    // Выручка (Пакет 3, Этап 1.2) — из finance_entries, а не налету из visits:
    // так туда попадают и авто-записи от визитов, и ручной ввод владельца.
    // Зарплаты мастеров по-прежнему считаются из visits (payout заморожен на
    // визите) — это отдельная формула, источник выручки её не касается.
    const revenueTotals = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS revenue
       FROM finance_entries
       WHERE company_id = $1 AND occurred_at BETWEEN $2 AND $3`,
      [companyId, from, to]
    );
    const revenue = parseFloat(revenueTotals.rows[0].revenue);

    const salaryTotals = await pool.query(
      `SELECT COALESCE(SUM(amount * master_payout_percent / 100), 0) AS master_salaries
       FROM visits
       WHERE company_id = $1 AND visit_at::date BETWEEN $2 AND $3`,
      [companyId, from, to]
    );
    const masterSalaries = parseFloat(salaryTotals.rows[0].master_salaries);

    const revenueByMaster = await pool.query(
      `SELECT membership_id, COALESCE(SUM(amount), 0) AS revenue
       FROM finance_entries
       WHERE company_id = $1 AND occurred_at BETWEEN $2 AND $3
       GROUP BY membership_id`,
      [companyId, from, to]
    );
    const revenueByMembershipId = {};
    let unassignedRevenue = 0;
    for (const row of revenueByMaster.rows) {
      if (row.membership_id === null) {
        unassignedRevenue = parseFloat(row.revenue);
      } else {
        revenueByMembershipId[row.membership_id] = parseFloat(row.revenue);
      }
    }

    // Разбивка выручки по нише визита (обсуждение 08.08.2026) — только для
    // студий с несколькими нишами имеет смысл, но считаем всегда (дёшево);
    // фронт решает, показывать ли блок, по числу ниш компании. Видна всем
    // ролям, как и byMaster — это не так чувствительно, как способ оплаты
    // (там реальная/наличная выручка мимо налоговой), не owner-only.
    // INNER JOIN на visits намеренно исключает ручные записи владельца без
    // визита — у них нет ниши по определению.
    const byNicheRes = await pool.query(
      `SELECT v.niche, COALESCE(SUM(fe.amount), 0) AS revenue, COUNT(*) AS visits_count
       FROM finance_entries fe
       JOIN visits v ON v.id = fe.visit_id
       WHERE fe.company_id = $1 AND fe.occurred_at BETWEEN $2 AND $3 AND v.niche IS NOT NULL
       GROUP BY v.niche
       ORDER BY revenue DESC`,
      [companyId, from, to]
    );

    const byMaster = await pool.query(
      `SELECT m.id AS master_membership_id, u.name AS master_name,
              COUNT(v.id) AS visits_count,
              COALESCE(SUM(v.amount * v.master_payout_percent / 100), 0) AS earnings
       FROM memberships m
       LEFT JOIN users u ON u.id = m.user_id
       LEFT JOIN visits v ON v.master_membership_id = m.id AND v.visit_at::date BETWEEN $2 AND $3
       WHERE m.company_id = $1 AND m.role = 'master'
       GROUP BY m.id, u.name
       ORDER BY u.name`,
      [companyId, from, to]
    );

    // Постоянные расходы (аренда и т.п.) вводятся как сумма ₽/мес — раньше
    // делились на 30 и умножались на число дней в периоде, чтобы "неделя"
    // тоже получала свою долю аренды. На практике это выглядело как
    // сломанный расчёт: владелец вводит 70 000, а в любом периоде короче
    // месяца видит случайную маленькую долю без понятной связи с введённой
    // суммой. Простое и понятное правило вместо этого: "Месяц"/"Прошлый
    // месяц" — это буквально расходы за месяц, показываем их целиком; любой
    // более короткий или произвольный период про постоянные расходы просто
    // не спрашивает (0), там нет вменяемого способа "поделить" месячный
    // счёт на день/неделю, который бы не выглядел как ошибка.
    const isFullMonthView = req.query.period === 'month' || req.query.period === 'lastMonth';

    const recurring = await pool.query(
      `SELECT kind, amount FROM recurring_expenses WHERE company_id = $1 AND active = true`,
      [companyId]
    );
    let fixedExpenses = 0;
    let percentRate = 0;
    if (isFullMonthView) {
      for (const row of recurring.rows) {
        if (row.kind === 'fixed') {
          fixedExpenses += parseFloat(row.amount);
        } else {
          percentRate += parseFloat(row.amount);
        }
      }
    }
    const percentExpenses = (revenue * percentRate) / 100;

    const variable = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expense_entries
       WHERE company_id = $1 AND occurred_at BETWEEN $2 AND $3`,
      [companyId, from, to]
    );
    const variableExpenses = parseFloat(variable.rows[0].total);

    const netProfit = revenue - masterSalaries - fixedExpenses - percentExpenses - variableExpenses;

    // Этап 5: администратор видит выручку и расходы, но не итоговую
    // прибыль/маржу компании — поле просто не попадает в ответ, а не
    // скрывается на фронтенде, чтобы не полагаться на доверие к клиенту.
    // Задача 3: мастер (Этап "просмотр" по решению владельца) видит ту же
    // сводку, что и администратор — netProfit ему тоже не отдаём.
    const summary = {
      period: { from, to, days },
      // Фронтенду нужно знать, учитываются ли постоянные/% расходы в этом
      // периоде вообще, чтобы не показывать их сумму строк расходов
      // отдельно от "Итого" (которое всегда 0 вне месячного вида).
      recurringCountedThisPeriod: isFullMonthView,
      revenue: round2(revenue),
      masterSalaries: round2(masterSalaries),
      fixedExpenses: round2(fixedExpenses),
      percentExpenses: round2(percentExpenses),
      variableExpenses: round2(variableExpenses),
      // без сотрудника — ручные записи владельца без привязки к мастеру, не
      // попадают ни в чей персональный ряд, но входят в общую выручку выше.
      unassignedRevenue: round2(unassignedRevenue),
      byMaster: byMaster.rows.map((r) => ({
        masterMembershipId: r.master_membership_id,
        masterName: r.master_name,
        visitsCount: Number(r.visits_count),
        revenue: round2(revenueByMembershipId[r.master_membership_id] || 0),
        earnings: round2(parseFloat(r.earnings)),
      })),
      byNiche: byNicheRes.rows.map((r) => ({
        niche: r.niche,
        visitsCount: Number(r.visits_count),
        revenue: round2(parseFloat(r.revenue)),
      })),
    };
    if (req.tenant.role === 'owner') {
      summary.netProfit = round2(netProfit);

      // Разбивка выручки по способу оплаты визита (План 04.08.2026, п.3) —
      // владелец видит, кто вводит поле (мастер/админ при самом визите) не
      // ограничено, но сводку по способам оплаты за период показываем
      // только ему: это раскрывает реальную выручку студии включая
      // наличные, не видные налоговой — не менее чувствительно, чем данные
      // аудита безопасности (см. комментарий в security.routes.js §8
      // политики), поэтому та же owner-only граница.
      const byPaymentMethodRes = await pool.query(
        `SELECT COALESCE(payment_method, 'unspecified') AS method,
                COUNT(*) AS visits_count,
                COALESCE(SUM(amount - COALESCE(discount_fixed_amount, amount * discount_percent / 100)), 0) AS revenue
         FROM visits
         WHERE company_id = $1 AND visit_at::date BETWEEN $2 AND $3
         GROUP BY method`,
        [companyId, from, to]
      );
      summary.byPaymentMethod = byPaymentMethodRes.rows.map((r) => ({
        method: r.method,
        visitsCount: Number(r.visits_count),
        revenue: round2(parseFloat(r.revenue)),
      }));
    }
    res.json(summary);
  })
);

// История по месяцам (Аналитика, 05.08.2026) — для трендов/графиков, в
// отличие от / (одна сводка за выбранный период). Каждая точка — целый
// календарный месяц, поэтому пост./% расходы считаются всегда (в отличие
// от /, где короткие периоды их не учитывают вовсе — здесь такого различия
// нет смысла делать, тренд по определению помесячный).
//
// Упрощение, унаследованное от / : recurring_expenses не хранит историю
// ставок — берём ТЕКУЩИЙ активный список и применяем его ко всем месяцам
// одинаково, даже прошлым. Если аренда менялась полгода назад, старые
// точки тренда будут немного не точны — тот же компромисс, что уже принят
// в основной сводке, не новый.
router.get(
  '/trends',
  asyncHandler(async (req, res) => {
    const months = Math.min(24, Math.max(1, parseInt(req.query.months, 10) || 12));
    const companyId = req.tenant.companyId;

    const byMonth = await pool.query(
      `WITH months AS (
         SELECT date_trunc('month', now() - make_interval(months => n))::date AS month_start
         FROM generate_series(0, $2 - 1) AS n
       ),
       revenue_by_month AS (
         SELECT date_trunc('month', occurred_at)::date AS month_start, SUM(amount) AS revenue
         FROM finance_entries
         WHERE company_id = $1 AND occurred_at >= now() - make_interval(months => $2)
         GROUP BY 1
       ),
       visits_by_month AS (
         SELECT date_trunc('month', visit_at)::date AS month_start,
                SUM(amount * master_payout_percent / 100) AS master_salaries,
                COUNT(*) AS visits_count,
                SUM(amount - COALESCE(discount_fixed_amount, amount * discount_percent / 100)) AS visits_revenue
         FROM visits
         WHERE company_id = $1 AND visit_at >= now() - make_interval(months => $2)
         GROUP BY 1
       ),
       variable_by_month AS (
         SELECT date_trunc('month', occurred_at)::date AS month_start, SUM(amount) AS variable_expenses
         FROM expense_entries
         WHERE company_id = $1 AND occurred_at >= now() - make_interval(months => $2)
         GROUP BY 1
       )
       SELECT to_char(m.month_start, 'YYYY-MM') AS month,
              COALESCE(r.revenue, 0) AS revenue,
              COALESCE(v.master_salaries, 0) AS master_salaries,
              COALESCE(v.visits_count, 0) AS visits_count,
              COALESCE(v.visits_revenue, 0) AS visits_revenue,
              COALESCE(e.variable_expenses, 0) AS variable_expenses
       FROM months m
       LEFT JOIN revenue_by_month r ON r.month_start = m.month_start
       LEFT JOIN visits_by_month v ON v.month_start = m.month_start
       LEFT JOIN variable_by_month e ON e.month_start = m.month_start
       ORDER BY m.month_start`,
      [companyId, months]
    );

    const recurring = await pool.query(
      `SELECT kind, amount FROM recurring_expenses WHERE company_id = $1 AND active = true`,
      [companyId]
    );
    let fixedExpenses = 0;
    let percentRate = 0;
    for (const row of recurring.rows) {
      if (row.kind === 'fixed') fixedExpenses += parseFloat(row.amount);
      else percentRate += parseFloat(row.amount);
    }

    const isOwner = req.tenant.role === 'owner';
    const trends = byMonth.rows.map((row) => {
      const revenue = parseFloat(row.revenue);
      const masterSalaries = parseFloat(row.master_salaries);
      const visitsCount = Number(row.visits_count);
      const visitsRevenue = parseFloat(row.visits_revenue);
      const percentExpenses = (revenue * percentRate) / 100;
      const netProfit = revenue - masterSalaries - fixedExpenses - percentExpenses - parseFloat(row.variable_expenses);

      const point = {
        month: row.month,
        revenue: round2(revenue),
        visitsCount,
        avgTicket: visitsCount > 0 ? round2(visitsRevenue / visitsCount) : 0,
      };
      // Та же граница, что и у /: маржа/прибыль — только владельцу, это
      // производные итоговой чистой прибыли компании.
      if (isOwner) {
        point.netProfit = round2(netProfit);
        point.marginPercent = revenue > 0 ? round2((netProfit / revenue) * 100) : 0;
        point.masterSalaries = round2(masterSalaries);
        point.fixedExpenses = round2(fixedExpenses);
        point.percentExpenses = round2(percentExpenses);
        point.variableExpenses = round2(parseFloat(row.variable_expenses));
      }
      return point;
    });

    res.json({ trends });
  })
);

module.exports = router;
