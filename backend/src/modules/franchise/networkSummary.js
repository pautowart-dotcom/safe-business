// Сводка по сети (16.10.2026, этапы 2 и 4 франшизы) — одна функция для
// пульта (franchise.routes.js /summary), ежемесячного отчёта (report.js) и
// снимка на 1-е число (scripts/franchiseMonthlySnapshot.js).
const pool = require('../../db/pool');
const { computeSecurityStatus } = require('../security/status');
const { getOpening } = require('../roadmap/opening');
const { onboardingCounts } = require('../staff/onboarding');

const INACTIVE_DAYS = 30;
const DEADLINES_RISK_THRESHOLD = 3;

function riskReasons({ zone, opening, overdueDeadlines, lastActiveAt }) {
  const reasons = [];
  if (!opening && zone === 'red') reasons.push('Красная зона');
  if (overdueDeadlines >= DEADLINES_RISK_THRESHOLD) reasons.push(`Подошло сроков: ${overdueDeadlines}`);
  // NULL — активность ещё не записывалась (поле появилось 16.10.2026), не
  // считаем это риском, чтобы после выкладки вся сеть не покраснела разом.
  if (lastActiveAt && Date.now() - new Date(lastActiveAt).getTime() > INACTIVE_DAYS * 24 * 3600 * 1000) {
    reasons.push(`Не заходили больше ${INACTIVE_DAYS} дней`);
  }
  return reasons;
}

async function computeNetworkSummary(group) {
  const { rows: members } = await pool.query(
    'SELECT id, name, last_active_at, opened_at FROM companies WHERE franchise_group_id = $1 ORDER BY name',
    [group.id]
  );
  const ids = members.map((m) => m.id);
  // Сроки, дата которых уже наступила и которые не закрыты. Для документов
  // сотрудников due_date — дата напоминания (за 14 дней до истечения,
  // staff-documents.routes.js), поэтому «подошло», а не «просрочено».
  const { rows: deadlineRows } = ids.length
    ? await pool.query(
        `SELECT company_id, count(*)::int AS n FROM deadlines
         WHERE company_id = ANY($1) AND status = 'pending' AND due_date <= CURRENT_DATE
         GROUP BY company_id`,
        [ids]
      )
    : { rows: [] };
  const overdueByCompany = new Map(deadlineRows.map((r) => [r.company_id, r.n]));

  const points = await Promise.all(
    members.map(async (m) => {
      const [status, opening, staff] = await Promise.all([computeSecurityStatus(m.id), getOpening(m.id), onboardingCounts(m.id)]);
      const point = {
        companyId: m.id,
        companyName: m.name,
        // Шаг открытия (Ф29) — только для точек в подготовке.
        opening:
          opening.status === 'preparing'
            ? { done: opening.done, total: opening.total, percent: opening.percent, currentStage: opening.currentStage }
            : null,
        openedAt: m.opened_at,
        niches: status.testedNiches,
        indexPercent: status.indexPercent,
        zone: status.zone,
        violationsCount: status.violationsCount,
        resolvedCount: status.violations.filter((v) => v.status === 'resolved').length,
        overdueDeadlines: overdueByCompany.get(m.id) || 0,
        lastActiveAt: m.last_active_at,
        // Оформление сотрудников (Ф17, 17.10.2026) — только числа, без имён.
        staffTotal: staff.staffTotal,
        staffWithOpenSteps: staff.staffWithOpenSteps,
      };
      point.riskReasons = riskReasons(point);
      return point;
    })
  );

  // Точки в подготовке ещё не работают — в средний индекс сети не идут.
  // Точки без теста не тянут среднее ни вверх, ни вниз (11.08.2026).
  const tested = points.filter((m) => m.indexPercent != null && !m.opening);
  const zoneCounts = { green: 0, yellow: 0, red: 0 };
  for (const m of tested) zoneCounts[m.zone] += 1;
  const network = {
    name: group.name,
    pointsTotal: points.length,
    pointsTested: tested.length,
    pointsPreparing: points.filter((m) => m.opening).length,
    pointsUntested: points.filter((m) => m.indexPercent == null && !m.opening).length,
    pointsAtRisk: points.filter((m) => m.riskReasons.length > 0).length,
    averageIndexPercent: tested.length > 0 ? Math.round(tested.reduce((sum, m) => sum + m.indexPercent, 0) / tested.length) : null,
    violationsOpen: tested.reduce((sum, m) => sum + Math.max((m.violationsCount || 0) - (m.resolvedCount || 0), 0), 0),
    deadlinesDue: points.reduce((sum, m) => sum + m.overdueDeadlines, 0),
    pointsWithStaffGaps: points.filter((m) => m.staffWithOpenSteps > 0).length,
    zoneCounts,
  };

  return { members: points, network };
}

module.exports = { computeNetworkSummary, riskReasons, INACTIVE_DAYS };
