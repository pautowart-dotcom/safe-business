// Индекс уже процитированных норм (18.09.2026, решение владельца) —
// lawChangeMonitor.js раньше ловил ЛЮБОЕ федеральное изменение по грубому
// списку слов ('налог', 'страхов' и т.п.), не привязанному ни к одной нише
// продукта. Владелец сам не может судить, важна ли, например, правка ст.166
// НК РФ студии маникюра — а честного способа спросить ИИ "точно ли это
// неважно" нет (тот же принцип "не выдумывай уверенность, которой нет", что
// уже в draftLawExplanation). Вместо этого — сверяем новые публикации с
// нормами, которые продукт УЖЕ цитирует по каждой нише (normBase в
// security/content/violations/*.js, lawReference в document-templates) и в
// налоговом калькуляторе (core/taxRegimeRecommender.js). Если совпадения
// нет вовсе — кандидат, скорее всего, реальный шум, не стоит его даже
// заводить в очередь.
const fs = require('fs');
const path = require('path');
const securityRepository = require('../modules/security/content/repository');
const documentRepository = require('../modules/document-templates/content/repository');

// ФЗ: "152-ФЗ", опционально с названием в кавычках сразу следом —
// "89-ФЗ «Об отходах производства и потребления»". Название нужно, потому
// что правки в именованный закон в реестре pravo.gov.ru чаще называются по
// имени закона ("О внесении изменений в Федеральный закон «О персональных
// данных»"), а не по его номеру.
const FZ_PATTERN = /(\d{2,3})-ФЗ(?:\s*«([^»]{3,120})»)?/g;

// ПП: два реальных формата в normBase — "ПП РФ №780" и "Постановление
// Правительства РФ от ... №780" (иногда "Российской Федерации" полностью).
const PP_PATTERN = /(?:ПП\s*РФ|Постановлени[ея]\s+Правительства(?:\s+Российской\s+Федерации)?)[^№]{0,60}№\s*(\d+)/g;

// Статьи НК РФ — только из core/taxRegimeRecommender.js (единственное
// место, где продукт реально что-то СЧИТАЕТ по кодексу, а не просто
// упоминает его вообще). Берём номер статьи до точки (346.21 → 346) —
// сверяем на уровне статьи, не подпункта, сознательно грубее: это сигнал
// "стоит посмотреть", не подтверждённый факт применимости.
const NK_ARTICLE_PATTERN = /ст\.?\s*(\d{2,3})(?:\.\d+)?[^.]{0,10}НК\s*РФ/gi;

function extractCitations(text) {
  if (!text) return [];
  const found = [];
  for (const m of text.matchAll(FZ_PATTERN)) {
    found.push({ type: 'fz', number: m[1], name: m[2] || null });
  }
  for (const m of text.matchAll(PP_PATTERN)) {
    found.push({ type: 'pp', number: m[1], name: null });
  }
  return found;
}

function extractNkArticles(text) {
  const numbers = new Set();
  for (const m of text.matchAll(NK_ARTICLE_PATTERN)) {
    numbers.add(m[1]);
  }
  return [...numbers];
}

let cachedIndex = null;

// Строится один раз за процесс (crown-скрипт живёт секунды, admin.routes.js
// — долгоживущий процесс, поэтому кэш) — контент шаблонов/нарушений не
// меняется без деплоя, пересборка индекса на каждый запрос была бы просто
// потерянной работой.
async function buildCitationIndex() {
  if (cachedIndex) return cachedIndex;

  const index = [];
  const niches = securityRepository.getNichesWithViolationContent();

  for (const niche of niches) {
    const matrix = await securityRepository.getViolationMatrix(niche);
    for (const v of matrix || []) {
      for (const c of extractCitations(v.normBase || '')) {
        index.push({ ...c, niche, context: `нарушение ${v.code} «${v.title}»` });
      }
    }
    const templates = await documentRepository.getTemplatesForNiche(niche);
    for (const t of templates || []) {
      for (const c of extractCitations(t.lawReference || '')) {
        index.push({ ...c, niche, context: `шаблон документа «${t.title}»` });
      }
    }
  }

  // taxRegimeRecommender.js — не по нишам (налоговый режим общий для всех),
  // читаем исходник как текст ради комментариев с номерами статей — сами
  // расчёты этого файла ничего не знают о конкретных номерах, это только
  // человеческая документация решений внутри него.
  try {
    const taxSource = fs.readFileSync(path.join(__dirname, 'taxRegimeRecommender.js'), 'utf8');
    for (const article of extractNkArticles(taxSource)) {
      index.push({ type: 'nk_article', number: article, name: null, niche: null, context: 'налоговый калькулятор (УСН/патент)' });
    }
  } catch (err) {
    console.error('citedLawReferences: не удалось прочитать taxRegimeRecommender.js', err);
  }

  cachedIndex = index;
  return index;
}

// item: { title, sourceBlock } — sourceBlock ('president'|'government')
// сужает тип совпадения: ФЗ ищем только среди президентского блока (там
// публикуются федеральные законы), ПП — только среди правительственного,
// чтобы случайное совпадение номеров разных по природе актов не путало
// (ФЗ №780 и ПП №780 — совершенно разные документы).
function matchCandidate(item, index) {
  const title = item.title;
  const matches = [];
  for (const c of index) {
    if (c.type === 'fz' && item.sourceBlock === 'president') {
      const numberHit = new RegExp(`№\\s*${c.number}-ФЗ\\b`).test(title);
      const nameHit = c.name && title.includes(c.name);
      if (numberHit || nameHit) matches.push(c);
    } else if (c.type === 'pp' && item.sourceBlock === 'government') {
      if (new RegExp(`№\\s*${c.number}\\b`).test(title)) matches.push(c);
    } else if (c.type === 'nk_article' && item.sourceBlock === 'president') {
      if (new RegExp(`стать[юия]\\s+${c.number}\\b`, 'i').test(title)) matches.push(c);
    }
  }
  return matches;
}

module.exports = { buildCitationIndex, matchCandidate, extractCitations, extractNkArticles };
