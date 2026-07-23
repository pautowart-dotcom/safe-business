const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');

const router = express.Router();

const toDateStr = (d) => d.toISOString().slice(0, 10);

// Пресеты Этапа 6: сегодня / неделя (скользящее окно, 7 дней) / месяц
// (текущий календарный, с 1-го числа) / прошлый месяц (полный календарный).
// dateFrom/dateTo в запросе — произвольный диапазон, переопределяет period.
function resolvePeriod(query) {
  const today = new Date();
  const toStr = toDateStr(today);

  if (query.dateFrom && query.dateTo) {
    return { from: query.dateFrom, to: query.dateTo };
  }

  if (query.period === 'lastMonth') {
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { from: toDateStr(lastMonthStart), to: toDateStr(lastMonthEnd) };
  }

  if (query.period === 'month') {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toDateStr(monthStart), to: toStr };
  }

  if (query.period === 'week') {
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 6);
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

    const recurring = await pool.query(
      `SELECT kind, amount FROM recurring_expenses WHERE company_id = $1 AND active = true`,
      [companyId]
    );
    let fixedExpenses = 0;
    let percentRate = 0;
    for (const row of recurring.rows) {
      if (row.kind === 'fixed') {
        fixedExpenses += (parseFloat(row.amount) / 30) * days;
      } else {
        percentRate += parseFloat(row.amount);
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
    };
    if (req.tenant.role === 'owner') {
      summary.netProfit = round2(netProfit);
    }
    res.json(summary);
  })
);

module.exports = router;
