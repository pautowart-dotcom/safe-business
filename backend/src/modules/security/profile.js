const pool = require('../../db/pool');

// Общая точка чтения профиля сегментации — используется security.routes.js,
// report.routes.js и status.js, чтобы не дублировать JOIN с
// security_profile_niches (миграция 0058: niche было singular-колонкой в
// security_profiles, теперь M:N через отдельную таблицу).
async function loadProfile(companyId) {
  const { rows } = await pool.query('SELECT * FROM security_profiles WHERE company_id = $1', [companyId]);
  if (!rows[0]) return null;
  const nichesRes = await pool.query(
    'SELECT niche, chemical_treatments, has_premises FROM security_profile_niches WHERE company_id = $1 ORDER BY id',
    [companyId]
  );
  const hairRow = nichesRes.rows.find((r) => r.niche === 'hair');
  const universalRow = nichesRes.rows.find((r) => r.niche === 'universal');
  return {
    legalForm: rows[0].legal_form,
    workModel: rows[0].work_model,
    segment: rows[0].segment,
    niches: nichesRes.rows.map((r) => r.niche),
    hairChemicalTreatments: hairRow ? !!hairRow.chemical_treatments : false,
    hasPremises: universalRow ? !!universalRow.has_premises : false,
    updatedAt: rows[0].updated_at,
  };
}

module.exports = { loadProfile };
