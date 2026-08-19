// ИИ-советник "скидка не окупается" (docs/business-ideas-backlog.md, раздел
// "ИИ-советник: скидка не окупается") — продолжение семьи ИИ-советников,
// начатой marginAdvisor.js (тот же принцип: чистая математика здесь, ИИ
// только облекает готовые числа в текст в discount-advisor.routes.js).
//
// Идея из бэклога: сопоставить % повторных визитов у клиентов со скидкой и
// без скидки — владелец обычно уверен, что скидка = лояльность, а на деле
// она может просто снижать чек, не удерживая клиента. Расчёт построен на
// той же клиентской группировке, что repeatClients в summary.routes.js
// (Этап 1: client_id, COUNT/MIN/MAX по visit_at), не изобретён заново —
// только сегментирован на два лагеря (со скидкой / без) и добавлено "вернулся
// ли клиент повторно в течение 60 дней" вместо просто "визитов больше 1".
const pool = require('../../db/pool');

const round2 = (n) => Math.round(n * 100) / 100;

// Та же формула, что в marginAdvisor.js/summary.routes.js — продублирована
// по тому же принципу (см. комментарий у DISCOUNT_AMOUNT_SQL в
// summary.routes.js): единственное пересечение ради пары строк.
const DISCOUNT_AMOUNT_SQL = "COALESCE(v.discount_fixed_amount, ROUND(v.amount * v.discount_percent / 100, 2))";
const FINAL_AMOUNT_SQL = `ROUND(v.amount - (${DISCOUNT_AMOUNT_SQL}), 2)`;

// Сколько дней ждём после последнего визита клиента в периоде, прежде чем
// честно посчитать "не вернулся" — иначе клиент, чей период просто недавно
// закончился, попал бы в "ушёл" только потому что времени пройти ещё не
// успело. Число из примера в бэклоге (60 дней), не выдумано отдельно.
const RETURN_WINDOW_DAYS = 60;

// Минимальный размер группы, при котором разница в % повторных визитов
// вообще что-то значит — на 1-2 клиентах любое число "22% vs 35%" случайно.
// Используется маршрутом при решении, показывать ли карточку в Центре
// действий (не встроено сюда жёстко — само число возвращается как есть).
const MIN_SAMPLE_SIZE = 5;

/**
 * @param {{ companyId: number, from: string, to: string }} params
 * @returns {Promise<object>}
 */
async function computeDiscountRepeatComparison({ companyId, from, to }) {
  const [summaryRes, comparisonRes] = await Promise.all([
    // Общая картина по скидкам за период — сколько визитов со скидкой и на
    // какую сумму, независимо от того, успели ли "созреть" для оценки
    // возврата (та же формула, что discountUsage в summary.routes.js).
    pool.query(
      `SELECT COUNT(*) AS total_visits,
              COUNT(*) FILTER (WHERE v.discount_percent > 0 OR v.discount_fixed_amount > 0) AS discounted_visits,
              COALESCE(SUM(${DISCOUNT_AMOUNT_SQL}), 0) AS total_discount_amount
       FROM visits v WHERE v.company_id = $1 AND v.visit_at::date BETWEEN $2 AND $3`,
      [companyId, from, to]
    ),
    // period_visits: один клиент — одна строка, discounted = была ли хоть
    // одна визит-со-скидкой у этого клиента в периоде, last_visit_in_period —
    // точка отсчёта окна "вернулся/не вернулся".
    // matured: только клиенты, у которых с последнего визита в периоде уже
    // прошло RETURN_WINDOW_DAYS — честная выборка (см. комментарий выше).
    // returned: EXISTS более позднего визита ТОГО ЖЕ клиента (любого мастера/
    // услуги — "вернулся в компанию", не обязательно к тому же мастеру) в
    // пределах окна.
    pool.query(
      `WITH period_visits AS (
         SELECT v.client_id,
                BOOL_OR(v.discount_percent > 0 OR v.discount_fixed_amount > 0) AS discounted,
                MAX(v.visit_at) AS last_visit_in_period
         FROM visits v
         WHERE v.company_id = $1 AND v.visit_at::date BETWEEN $2 AND $3
         GROUP BY v.client_id
       ),
       matured AS (
         SELECT * FROM period_visits WHERE last_visit_in_period <= now() - make_interval(days => ${RETURN_WINDOW_DAYS})
       )
       SELECT m.discounted,
              COUNT(*) AS total_clients,
              COUNT(*) FILTER (
                WHERE EXISTS (
                  SELECT 1 FROM visits v2
                  WHERE v2.company_id = $1 AND v2.client_id = m.client_id
                    AND v2.visit_at > m.last_visit_in_period
                    AND v2.visit_at <= m.last_visit_in_period + make_interval(days => ${RETURN_WINDOW_DAYS})
                )
              ) AS returned_clients
       FROM matured m
       GROUP BY m.discounted`,
      [companyId, from, to]
    ),
  ]);

  const totalVisits = Number(summaryRes.rows[0].total_visits);
  const discountedVisits = Number(summaryRes.rows[0].discounted_visits);
  const discountSummary = {
    totalVisits,
    discountedVisits,
    discountRate: totalVisits > 0 ? round2((discountedVisits / totalVisits) * 100) : 0,
    totalDiscountAmount: round2(parseFloat(summaryRes.rows[0].total_discount_amount)),
  };

  const withRow = comparisonRes.rows.find((r) => r.discounted === true);
  const withoutRow = comparisonRes.rows.find((r) => r.discounted === false);

  function toGroup(row) {
    if (!row) return { clients: 0, returnedClients: 0, repeatRate: null };
    const clients = Number(row.total_clients);
    const returnedClients = Number(row.returned_clients);
    return { clients, returnedClients, repeatRate: clients > 0 ? round2((returnedClients / clients) * 100) : null };
  }

  return {
    period: { from, to },
    discountSummary,
    repeatComparison: {
      windowDays: RETURN_WINDOW_DAYS,
      minSampleSize: MIN_SAMPLE_SIZE,
      withDiscount: toGroup(withRow),
      withoutDiscount: toGroup(withoutRow),
    },
  };
}

module.exports = { computeDiscountRepeatComparison, RETURN_WINDOW_DAYS, MIN_SAMPLE_SIZE };
