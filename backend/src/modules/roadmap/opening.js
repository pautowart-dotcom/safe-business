// Открытие внутри системы (16.10.2026, docs/franchise-funkcional.md §11,
// этап 1). Тот же роадмап, что и разовый PDF-продукт (buildRoadmap.js), но
// пункты отмечаются галочками в кабинете. Общая функция — и для страницы
// точки (opening.routes.js), и для пульта сети (franchise.routes.js).
const pool = require('../../db/pool');
const { buildRoadmap, NICHE_LABELS } = require('./content/buildRoadmap');

// Ниша роадмапа: выбранная при регистрации, иначе первая из теста.
function pickNiche(company, testedNiches) {
  if (company.signup_niche && NICHE_LABELS[company.signup_niche]) return company.signup_niche;
  return testedNiches.find((n) => NICHE_LABELS[n]) || null;
}

async function getOpening(companyId) {
  const [companyRes, nichesRes, doneRes] = await Promise.all([
    pool.query(
      `SELECT signup_niche, legal_form, has_employees, opening_status, opened_at FROM companies WHERE id = $1`,
      [companyId]
    ),
    pool.query(`SELECT niche FROM security_profile_niches WHERE company_id = $1 ORDER BY niche`, [companyId]),
    pool.query(`SELECT item_key, done_at FROM company_opening_items WHERE company_id = $1`, [companyId]),
  ]);
  const company = companyRes.rows[0];
  if (!company) return null;

  const niche = pickNiche(company, nichesRes.rows.map((r) => r.niche));
  const base = { status: company.opening_status, openedAt: company.opened_at };
  if (!niche) return { ...base, roadmap: null, total: 0, done: 0, percent: null, currentStage: null };

  // Шаги регистрации ИП/ООО показываем, только если юрформа известна —
  // иначе не угадываем (её можно указать в настройках).
  const roadmap = buildRoadmap({
    niche,
    legalForm: company.legal_form,
    hasEmployees: company.has_employees !== false,
    includeRegistration: !!company.legal_form,
  });

  const doneMap = new Map(doneRes.rows.map((r) => [r.item_key, r.done_at]));
  let total = 0;
  let done = 0;
  let currentStage = null;
  const stages = roadmap.stages.map((stage) => {
    const items = stage.items.map((item) => ({ ...item, doneAt: doneMap.get(item.key) || null }));
    const stageDone = items.filter((i) => i.doneAt).length;
    total += items.length;
    done += stageDone;
    if (!currentStage && stageDone < items.length) currentStage = stage.title;
    return { ...stage, items, done: stageDone, total: items.length };
  });

  return {
    ...base,
    roadmap: { ...roadmap, stages },
    total,
    done,
    percent: total > 0 ? Math.round((done / total) * 100) : null,
    currentStage,
  };
}

// Все ключи пунктов роадмапа компании — для проверки, что отмечают
// существующий пункт, а не произвольную строку.
function itemKeys(opening) {
  if (!opening?.roadmap) return new Set();
  return new Set(opening.roadmap.stages.flatMap((s) => s.items.map((i) => i.key)));
}

module.exports = { getOpening, itemKeys };
