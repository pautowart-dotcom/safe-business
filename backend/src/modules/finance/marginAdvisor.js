// ИИ-советник по марже (Этап 6 плана docs/plan-2026-08-15-analytics-ai-monthly-summary.md,
// полное описание и пример расчёта — docs/business-ideas-backlog.md, раздел
// "ИИ-советник по марже"). Сам расчёт — чистая математика по уже
// существующим данным (Этапы 2-4: длительность услуги, себестоимость
// материалов, % мастера), без сети и без ИИ — ИИ (см. ../../core/yandexAssist.js)
// только облекает готовые числа в текст в margin-advisor.routes.js, здесь
// его нет вообще. Формула на визит:
//   маржа = цена после скидки - себестоимость материалов - выплата мастеру
//   маржа/мин = маржа / длительность услуги (services.duration_minutes)
// Пример из бэклога: маникюр 1500₽/40мин/920₽ расходов → 14.5₽/мин;
// наращивание 2500₽/90мин/1700₽ расходов → 8.9₽/мин — при бОльшем чеке
// хуже использует время мастера.
const pool = require('../../db/pool');

const round2 = (n) => Math.round(n * 100) / 100;

// Та же формула скидки/итога, что в summary.routes.js/visits.routes.js —
// продублирована здесь по тому же принципу, что и там (см. комментарий у
// DISCOUNT_AMOUNT_SQL в summary.routes.js): единственное пересечение ради
// одной строки, общий модуль не стали заводить.
const DISCOUNT_AMOUNT_SQL = "COALESCE(v.discount_fixed_amount, ROUND(v.amount * v.discount_percent / 100, 2))";
const FINAL_AMOUNT_SQL = `ROUND(v.amount - (${DISCOUNT_AMOUNT_SQL}), 2)`;

/**
 * Маржа и маржа/минуту по каждой услуге каталога за период. Только визиты
 * с service_id (без привязки к каталогу — нет длительности, посчитать
 * маржу/минуту нечем, тот же принцип, что у utilization в summary.routes.js
 * insights). Возвращает массив, отсортированный от худшей маржи/минуту к
 * лучшей — владелец в первую очередь должен увидеть, где теряет больше
 * всего на минуту работы мастера.
 *
 * @param {{ companyId: number, from: string, to: string }} params
 * @returns {Promise<Array>}
 */
async function computeMarginByService({ companyId, from, to }) {
  // Себестоимость материалов агрегируется на уровне визита СНАЧАЛА (CTE),
  // потом джойнится к visits ОДИН РАЗ на визит — иначе прямой JOIN
  // visit_supplies размножил бы строки visits и испортил SUM() по выручке
  // и выплате мастера в основном запросе.
  // unpriced_supplies_count > 0 или сам визит не попал в CTE (нет ни одной
  // строки visit_supplies) — оба случая честно помечаем как "нет полных
  // данных по материалам для этого визита" в dataCoveragePercent ниже,
  // а не молча считаем расходники бесплатными.
  const { rows } = await pool.query(
    `WITH visit_materials AS (
       SELECT vs.visit_id,
              SUM(vs.quantity * s.unit_cost) AS materials_cost,
              COUNT(*) FILTER (WHERE s.unit_cost IS NULL) AS unpriced_supplies_count
       FROM visit_supplies vs
       JOIN supplies s ON s.id = vs.supply_id
       WHERE vs.company_id = $1
       GROUP BY vs.visit_id
     )
     SELECT
       sv.id AS service_id,
       sv.name AS service_name,
       sv.niche,
       sv.duration_minutes,
       COUNT(v.id) AS visits_count,
       COALESCE(SUM(${FINAL_AMOUNT_SQL}), 0) AS total_revenue,
       COALESCE(SUM(v.master_payout_amount), 0) AS total_master_payout,
       COALESCE(SUM(vm.materials_cost), 0) AS total_materials_cost,
       COUNT(*) FILTER (WHERE vm.visit_id IS NULL OR vm.unpriced_supplies_count > 0) AS visits_with_incomplete_materials
     FROM services sv
     JOIN visits v ON v.service_id = sv.id AND v.visit_at::date BETWEEN $2 AND $3
     LEFT JOIN visit_materials vm ON vm.visit_id = v.id
     WHERE sv.company_id = $1
     GROUP BY sv.id, sv.name, sv.niche, sv.duration_minutes
     HAVING COUNT(v.id) > 0
     ORDER BY sv.name`,
    [companyId, from, to]
  );

  const services = rows.map((r) => {
    const visitsCount = Number(r.visits_count);
    const durationMinutes = Number(r.duration_minutes);
    const revenue = parseFloat(r.total_revenue);
    const masterPayout = parseFloat(r.total_master_payout);
    const materialsCost = parseFloat(r.total_materials_cost);
    const totalMargin = revenue - masterPayout - materialsCost;
    const avgMargin = visitsCount > 0 ? totalMargin / visitsCount : 0;
    // durationMinutes > 0 гарантировано CHECK-констрейнтом в services
    // (0081_services.sql), но не полагаемся на это молча — явная проверка.
    const marginPerMinute = durationMinutes > 0 ? avgMargin / durationMinutes : null;

    return {
      serviceId: r.service_id,
      serviceName: r.service_name,
      niche: r.niche,
      durationMinutes,
      visitsCount,
      avgPrice: visitsCount > 0 ? round2(revenue / visitsCount) : 0,
      avgMasterPayout: visitsCount > 0 ? round2(masterPayout / visitsCount) : 0,
      avgMaterialsCost: visitsCount > 0 ? round2(materialsCost / visitsCount) : 0,
      avgMargin: round2(avgMargin),
      marginPerMinute: marginPerMinute === null ? null : round2(marginPerMinute),
      // Доля визитов ЭТОЙ услуги за период с полными данными по материалам
      // (та же идея честности, что dataCoveragePercent у utilization в
      // summary.routes.js insights) — низкое значение означает, что
      // avgMaterialsCost/avgMargin занижены (часть визитов не добавила
      // расходов в числитель), не что материалы реально бесплатны.
      dataCoveragePercent:
        visitsCount > 0
          ? round2(((visitsCount - Number(r.visits_with_incomplete_materials)) / visitsCount) * 100)
          : 0,
    };
  });

  services.sort((a, b) => {
    if (a.marginPerMinute === null && b.marginPerMinute === null) return 0;
    if (a.marginPerMinute === null) return 1;
    if (b.marginPerMinute === null) return -1;
    return a.marginPerMinute - b.marginPerMinute;
  });

  return services;
}

module.exports = { computeMarginByService };
