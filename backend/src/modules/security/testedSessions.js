const pool = require('../../db/pool');

// Последняя завершённая сессия по каждой из переданных ниш (одна запись на
// нишу) — общий строительный блок для объединённого индекса/отчёта при
// нескольких выбранных нишах (status.js, report.routes.js). Сессии по-прежнему
// строго одно-нишевые (как и до мультивыбора) — просто здесь мы берём
// "последнюю по каждой актуальной нише" вместо одной сессии на компанию.
async function loadLatestCompletedSessionsByNiche(companyId, niches) {
  if (!niches || niches.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (niche) * FROM security_sessions
     WHERE company_id = $1 AND status = 'completed' AND niche = ANY($2)
     ORDER BY niche, completed_at DESC`,
    [companyId, niches]
  );
  return rows;
}

module.exports = { loadLatestCompletedSessionsByNiche };
