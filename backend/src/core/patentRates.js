const pool = require('../db/pool');

// Ставка патента (ПСН) — региональный закон устанавливает "потенциальный
// возможный доход" по виду деятельности на календарный год, из которого
// считается сумма патента (обычно 6% от потенциального дохода, ст. 346.51
// НК РФ). Каждый регион принимает свой закон на каждый год отдельно
// (иногда меняет и посреди года) — поэтому year обязателен в поиске,
// "актуальной" ставки без года не существует.
//
// Строки в patent_rates заполняются РЕАКТИВНО через админку (Фаза 2,
// 28.08.2026) — только когда для конкретного региона+ниши+года реально
// понадобилась ставка платящей компании, не заранее на все 89 регионов.
// Поэтому unknown_region/unknown_tier — ОЖИДАЕМЫЙ результат для
// подавляющего большинства запросов первое время, не ошибка.
//
// Три явных состояния — продукт никогда не показывает угаданное число:
// - { status: 'found', amount, reviewed, sourceUrl, lawReference }
// - { status: 'unknown_region' } — для этого региона+ниши+года вообще нет
//   данных (или regionCode/niche/year не переданы)
// - { status: 'unknown_tier' } — регион+ниша+год есть, но не под эти
//   employeeTier/areaTier
async function getPatentRate({ regionCode, niche, year, employeeTier = '', areaTier = '' }) {
  if (!regionCode || !niche || !year) {
    return { status: 'unknown_region' };
  }

  const { rows: anyForRegion } = await pool.query(
    `SELECT 1 FROM patent_rates WHERE region_code = $1 AND niche = $2 AND year = $3 LIMIT 1`,
    [regionCode, niche, year]
  );
  if (anyForRegion.length === 0) {
    return { status: 'unknown_region' };
  }

  const { rows } = await pool.query(
    `SELECT amount, status, source_url AS "sourceUrl", law_reference AS "lawReference"
     FROM patent_rates
     WHERE region_code = $1 AND niche = $2 AND year = $3 AND employee_tier = $4 AND area_tier = $5
     LIMIT 1`,
    [regionCode, niche, year, employeeTier, areaTier]
  );
  if (rows.length === 0) {
    return { status: 'unknown_tier' };
  }

  const row = rows[0];
  return {
    status: 'found',
    amount: Number(row.amount),
    reviewed: row.status === 'reviewed',
    sourceUrl: row.sourceUrl,
    lawReference: row.lawReference,
  };
}

module.exports = { getPatentRate };
