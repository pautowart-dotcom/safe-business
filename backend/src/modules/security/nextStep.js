// Следующий открытый пункт пути до 100 % — тот же порядок, что на главной
// (path.js): три коротких дела, потом остальные. Напоминание и бот берут
// один этот пункт, не весь список.
const pool = require('../../db/pool');
const repository = require('./content/repository');
const { orderPath } = require('./path');
const { computeSecurityStatus } = require('./status');

const matrixCache = new Map();

async function matrix(niche) {
  if (!matrixCache.has(niche)) matrixCache.set(niche, await repository.getViolationMatrix(niche));
  return matrixCache.get(niche);
}

async function nextOpenStep(companyId) {
  const { rows } = await pool.query(
    `SELECT id, violation_code, niche FROM security_violations
     WHERE company_id = $1 AND status = 'open'`,
    [companyId]
  );
  if (!rows.length) return null;
  const { gainByCode } = await computeSecurityStatus(companyId);
  const open = [];
  for (const row of rows) {
    const details = (await matrix(row.niche))?.find((v) => v.code === row.violation_code);
    if (!details) continue;
    open.push({
      ...details,
      id: row.id,
      status: 'open',
      gain: gainByCode[row.violation_code] || 0,
    });
  }
  return orderPath(open)[0] || null;
}

module.exports = { nextOpenStep };
