const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');

const router = express.Router();

// Скользящее окно (последние N дней), а не календарные сутки/неделя/месяц —
// проще и не зависит от часового пояса компании. dateFrom/dateTo в запросе
// переопределяют period.
function resolvePeriod(query) {
  const today = new Date();
  const toStr = today.toISOString().slice(0, 10);

  if (query.dateFrom && query.dateTo) {
    return { from: query.dateFrom, to: query.dateTo };
  }

  const daysBack = { today: 0, week: 6, month: 29 }[query.period] ?? 29;
  const from = new Date(today);
  from.setDate(from.getDate() - daysBack);
  return { from: from.toISOString().slice(0, 10), to: toStr };
}

const round2 = (n) => Math.round(n * 100) / 100;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { from, to } = resolvePeriod(req.query);
    const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
    const companyId = req.tenant.companyId;

    const visitsTotals = await pool.query(
      `SELECT
         COALESCE(SUM(amount - (amount * discount_percent / 100)), 0) AS revenue,
         COALESCE(SUM(amount * master_payout_percent / 100), 0) AS master_salaries
       FROM visits
       WHERE company_id = $1 AND visit_at::date BETWEEN $2 AND $3`,
      [companyId, from, to]
    );
    const revenue = parseFloat(visitsTotals.rows[0].revenue);
    const masterSalaries = parseFloat(visitsTotals.rows[0].master_salaries);

    const byMaster = await pool.query(
      `SELECT m.id AS master_membership_id, u.name AS master_name,
              COUNT(v.id) AS visits_count,
              COALESCE(SUM(v.amount - (v.amount * v.discount_percent / 100)), 0) AS revenue,
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

    res.json({
      period: { from, to, days },
      revenue: round2(revenue),
      masterSalaries: round2(masterSalaries),
      fixedExpenses: round2(fixedExpenses),
      percentExpenses: round2(percentExpenses),
      variableExpenses: round2(variableExpenses),
      netProfit: round2(netProfit),
      byMaster: byMaster.rows.map((r) => ({
        masterMembershipId: r.master_membership_id,
        masterName: r.master_name,
        visitsCount: Number(r.visits_count),
        revenue: round2(parseFloat(r.revenue)),
        earnings: round2(parseFloat(r.earnings)),
      })),
    });
  })
);

module.exports = router;
