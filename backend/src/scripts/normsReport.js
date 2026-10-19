// Отчёт «норма → что на ней стоит» (19.10.2026, реестр
// modules/knowledge-cards/norms.js). Поменялся закон — смотрим, какие статьи
// справочника и пункты теста обновить разом. Ничего не меняет, только печатает.
//
//   node src/scripts/normsReport.js            — все нормы
//   node src/scripts/normsReport.js ppr-1479   — одна норма, с кодами пунктов теста
const fs = require('fs');
const path = require('path');
const { NORMS } = require('../modules/knowledge-cards/norms');
const { getCard } = require('../modules/knowledge-cards/repository');

const CARDS_DIR = path.join(__dirname, '../modules/knowledge-cards/cards');
const VIOLATIONS_DIR = path.join(__dirname, '../modules/security/content/violations');
const SOON_DAYS = 120;
const STALE_DAYS = 180;

const DAY = 24 * 60 * 60 * 1000;
const today = new Date(new Date().toISOString().slice(0, 10));
const daysFrom = (iso) => Math.round((new Date(iso) - today) / DAY);

function loadCards() {
  return fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith('.js')).map((f) => require(path.join(CARDS_DIR, f)));
}

function loadViolations() {
  return fs.readdirSync(VIOLATIONS_DIR).filter((f) => f.endsWith('.js')).flatMap((f) => {
    const { niche, violations } = require(path.join(VIOLATIONS_DIR, f));
    return (violations || []).map((v) => ({ niche, code: v.code, text: `${v.normBase || ''} ${v.fineText || ''}` }));
  });
}

async function main() {
  const only = process.argv[2];
  if (only && !NORMS[only]) throw new Error(`Нет нормы «${only}». Есть: ${Object.keys(NORMS).join(', ')}`);
  const cards = loadCards();
  const violations = loadViolations();

  const warnings = [];
  for (const [key, n] of Object.entries(NORMS)) {
    if (n.validUntil && daysFrom(n.validUntil) <= SOON_DAYS) {
      const d = daysFrom(n.validUntil);
      warnings.push(`${key}: ${d < 0 ? 'срок действия истёк' : `действует ещё ${d} дн.`} (до ${n.validUntil})${n.note ? ` — ${n.note}` : ''}`);
    }
    if (-daysFrom(n.checkedAt) > STALE_DAYS) warnings.push(`${key}: не сверяли ${-daysFrom(n.checkedAt)} дн. (с ${n.checkedAt})`);
  }
  if (!only && warnings.length) console.log(`ВНИМАНИЕ\n${warnings.map((w) => `  - ${w}`).join('\n')}\n`);

  for (const [key, n] of Object.entries(NORMS)) {
    if (only && key !== only) continue;
    const used = cards.flatMap((c) => (c.sources || [])
      .filter((s) => s.norm === key)
      .map((s) => `${c.id} «${c.question}»${s.points ? ` — ${s.points}` : ''}${c.status === 'source_checked' || c.status === 'lawyer_checked' ? '' : ` [${c.status}]`}`));
    const hits = n.testMatch ? violations.filter((v) => n.testMatch.test(v.text)) : [];
    const byNiche = {};
    for (const h of hits) (byNiche[h.niche] ||= []).push(h.code);
    console.log(`${key} — ${n.title}`);
    console.log(`  сверено: ${n.checkedAt}${n.validUntil ? `, действует до ${n.validUntil}` : ''}${n.url ? `, ${n.url}` : ''}`);
    console.log(`  статьи справочника: ${used.length ? '' : 'нет'}`);
    for (const u of used) console.log(`    ${u}`);
    const niches = Object.keys(byNiche);
    console.log(`  пункты теста: ${hits.length}${niches.length ? ` в ${niches.length} нишах` : ''}`);
    if (only) for (const [niche, codes] of Object.entries(byNiche)) console.log(`    ${niche}: ${codes.join(', ')}`);
    console.log('');
  }

  // Источники-строки (письма, разъяснения) в реестр не входят — их видно здесь,
  // чтобы закон, записанный строкой по ошибке, не выпал из обновлений.
  if (!only) {
    const loose = cards.flatMap((c) => (c.sources || []).filter((s) => !s.norm).map((s) => `${c.id}: ${s.title || s}`));
    if (loose.length) console.log(`Источники вне реестра (разовые документы):\n${loose.map((l) => `  ${l}`).join('\n')}`);
  }
  // Карточка, которая есть в папке, но не подключена в repository.js, на сайт не попадёт.
  const missing = [];
  for (const c of cards) if (!(await getCard(c.id))) missing.push(c.id);
  if (missing.length) console.log(`\nНе подключены в knowledge-cards/repository.js: ${missing.join(', ')}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
