// Прототип «Без.Биз смотрит снаружи» (22.10.2026): снимок открытых реестров
// по ИНН через Checko → понятные находки (modules/outside-watch/findings.js).
// Только для ручного запуска владельцем, в продукт пока не подключено.
//
//   node src/scripts/outsideSnapshot.js <ИНН> [<ИНН> ...] [--out <папка>]
//   node src/scripts/outsideSnapshot.js --from-file <снимок.json>
//
// --from-file разбирает уже скачанный снимок без запросов к Checko.
// Сырые ответы сохраняются в --out (по умолчанию — системная временная папка),
// НЕ в репозиторий: в данных ИП есть ФИО и ИНН физлица.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { fetchAllByInn } = require('../modules/outside-watch/checkoClient');
const { buildFindings } = require('../modules/outside-watch/findings');

const LEVEL_MARK = { alert: '[!]', attention: '[>]', info: '[i]', ok: '[ok]' };
const LEVEL_ORDER = { alert: 0, attention: 1, info: 2, ok: 3 };

function parseArgs(argv) {
  const inns = [];
  const files = [];
  let outDir = path.join(os.tmpdir(), 'bezbiz-outside-snapshot');
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') outDir = argv[++i];
    else if (argv[i] === '--from-file') files.push(argv[++i]);
    else inns.push(argv[i]);
  }
  return { inns, files, outDir };
}

function printFindings(snapshot) {
  console.log(`\nИНН ${snapshot.inn} — снимок от ${snapshot.fetchedAt.slice(0, 10)}`);
  const findings = buildFindings(snapshot).sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  for (const f of findings) {
    console.log(`\n${LEVEL_MARK[f.level]} ${f.title}`);
    if (f.meaning) console.log(`    Что это значит: ${f.meaning}`);
    if (f.action) console.log(`    Что сделать: ${f.action}`);
    console.log(`    Источник: ${f.sourceNote}`);
  }
}

async function main() {
  const { inns, files, outDir } = parseArgs(process.argv.slice(2));
  if (!inns.length && !files.length) {
    console.error('Использование: node src/scripts/outsideSnapshot.js <ИНН> [...] [--out <папка>] | --from-file <снимок.json>');
    process.exit(1);
  }

  for (const file of files) {
    printFindings(JSON.parse(fs.readFileSync(file, 'utf8')));
  }

  if (inns.length) fs.mkdirSync(outDir, { recursive: true });
  for (const inn of inns) {
    const snapshot = await fetchAllByInn(inn);
    const file = path.join(outDir, `${snapshot.inn}-${snapshot.fetchedAt.slice(0, 10)}.json`);
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
    printFindings(snapshot);
    console.log(`\nСырые данные: ${file}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
