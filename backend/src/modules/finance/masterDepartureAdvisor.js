// ИИ-советник "цена ушедшего мастера" (docs/business-ideas-backlog.md,
// раздел "ИИ-советник: цена ушедшего мастера") — третий в семье ИИ-советников
// (marginAdvisor.js, discountAdvisor.js). Чистая математика, без ИИ — ИИ
// (см. ../../core/yandexAssist.js) только облекает готовые числа в текст в
// master-departure-advisor.routes.js.
//
// Чувствительная тема (см. бэклог): владелец обычно считает цену увольнения
// как "зарплата + найм нового", не как "клиенты, которых мастер забрал с
// собой" — реальная цена почти всегда больше. Подача должна быть "удержание
// дороже, чем кажется", не инструмент давления на мастеров — этим занимается
// текст в роуте, здесь только числа.
//
// Дата ухода — в схеме нет deactivated_at, только memberships.active
// (булево), поэтому дата ухода оценочна: дата ПОСЛЕДНЕГО визита мастера
// (так и написано в бэклоге — "не выдумывать точность, которой нет в данных").
const pool = require('../../db/pool');
const { moscowDateStr } = require('../../utils/moscowDate');

const round2 = (n) => Math.round(n * 100) / 100;

const DISCOUNT_AMOUNT_SQL = "COALESCE(v.discount_fixed_amount, ROUND(v.amount * v.discount_percent / 100, 2))";
const FINAL_AMOUNT_SQL = `ROUND(v.amount - (${DISCOUNT_AMOUNT_SQL}), 2)`;

// Постоянный клиент мастера — минимум 2 визита именно к нему до ухода
// (разовая консультация не в счёт). Порог — решение реализации, не факт из
// данных, при необходимости легко поменять.
const MIN_VISITS_FOR_REGULAR_CLIENT = 2;

// Считать "ушёл/остался" честно можно только когда с даты ухода прошло
// достаточно времени, чтобы постоянный клиент успел бы вернуться при обычном
// ритме визитов — иначе мастер, уволившийся неделю назад, выглядел бы так,
// будто забрал с собой всех клиентов разом. То же значение, что и окно
// возврата в discountAdvisor.js (там взято из примера в бэклоге) — здесь
// используется как разумный минимум, не строгий факт.
const MIN_DAYS_SINCE_DEPARTURE = 30;

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

/**
 * @param {{ companyId: number }} params
 * @returns {Promise<Array>}
 */
async function computeMasterDepartureImpact({ companyId }) {
  const { rows: mastersRows } = await pool.query(
    `SELECT m.id AS master_membership_id, u.name AS master_name, MAX(v.visit_at) AS last_visit_at
     FROM memberships m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN visits v ON v.master_membership_id = m.id AND v.company_id = m.company_id
     WHERE m.company_id = $1 AND m.role = 'master' AND m.active = false
     GROUP BY m.id, u.name
     HAVING MAX(v.visit_at) IS NOT NULL`,
    [companyId]
  );

  const todayStr = moscowDateStr();
  const results = [];

  for (const row of mastersRows) {
    const departureDateStr = moscowDateStr(row.last_visit_at);
    const daysSinceDeparture = daysBetween(departureDateStr, todayStr);

    if (daysSinceDeparture < MIN_DAYS_SINCE_DEPARTURE) {
      // Мастер ушёл, но данных ещё честно не хватает на вывод — показываем
      // как "рано считать", а не молчим и не подгоняем число.
      results.push({
        masterMembershipId: row.master_membership_id,
        masterName: row.master_name,
        departureDate: departureDateStr,
        daysSinceDeparture,
        tooRecentToJudge: true,
      });
      continue;
    }

    // classified: постоянные клиенты этого мастера (>= MIN_VISITS_FOR_REGULAR_CLIENT
    // визитов к нему до ухода) + остались ли они в компании (visit_at > дата
    // ухода, к любому мастеру — "остался в салоне", не обязательно к тому же
    // человеку). left_clients_revenue — реальная историческая выручка от
    // "ушедших" клиентов за 12 месяцев ДО ухода мастера (не прогноз будущей
    // выручки — только то, что уже случилось, чтобы не выдумывать суммы).
    const { rows } = await pool.query(
      `WITH regular_clients AS (
         SELECT v.client_id
         FROM visits v
         WHERE v.company_id = $1 AND v.master_membership_id = $2 AND v.visit_at <= $3
         GROUP BY v.client_id
         HAVING COUNT(*) >= $4
       ),
       classified AS (
         SELECT rc.client_id,
                EXISTS (
                  SELECT 1 FROM visits v2
                  WHERE v2.company_id = $1 AND v2.client_id = rc.client_id AND v2.visit_at > $3
                ) AS stayed
         FROM regular_clients rc
       ),
       left_clients_revenue AS (
         SELECT COALESCE(SUM(${FINAL_AMOUNT_SQL}), 0) AS revenue
         FROM visits v
         JOIN classified c ON c.client_id = v.client_id AND c.stayed = false
         WHERE v.company_id = $1 AND v.visit_at > $3::timestamptz - interval '365 days' AND v.visit_at <= $3
       )
       SELECT
         (SELECT COUNT(*) FROM classified) AS regular_clients_count,
         (SELECT COUNT(*) FROM classified WHERE stayed) AS stayed_count,
         (SELECT revenue FROM left_clients_revenue) AS left_clients_revenue`,
      [companyId, row.master_membership_id, row.last_visit_at, MIN_VISITS_FOR_REGULAR_CLIENT]
    );

    const regularClientsCount = Number(rows[0].regular_clients_count);
    const stayedCount = Number(rows[0].stayed_count);
    const leftCount = regularClientsCount - stayedCount;

    results.push({
      masterMembershipId: row.master_membership_id,
      masterName: row.master_name,
      departureDate: departureDateStr,
      daysSinceDeparture,
      tooRecentToJudge: false,
      regularClientsCount,
      stayedCount,
      leftCount,
      // Реальная выручка от "ушедших" клиентов за год до ухода мастера —
      // историческая, не прогноз (см. комментарий у left_clients_revenue).
      leftClientsRevenueLast12Months: round2(parseFloat(rows[0].left_clients_revenue)),
    });
  }

  return results;
}

module.exports = { computeMasterDepartureImpact, MIN_VISITS_FOR_REGULAR_CLIENT, MIN_DAYS_SINCE_DEPARTURE };
