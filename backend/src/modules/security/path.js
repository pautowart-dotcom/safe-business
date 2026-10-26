// Путь до 100 % (26.10.2026, docs/plan-2026-10-26.md, шаг 2). Каждое
// открытое нарушение — шаг: инструкция → документ из пакета → «Сделано»
// (по желанию с фото или файлом) → индекс растёт. Человек видит «осталось 7
// шагов», а не «30 нарушений».
//
// Порядок: первые QUICK_FIRST шагов — быстрые победы (бесплатно и до недели,
// больше прирост — раньше), чтобы индекс начал расти сразу; дальше — по
// риску, как в карте уязвимостей.
const scoring = require('./content/scoring');

const QUICK_FIRST = 3;
const QUICK_MAX_DAYS = 7;

function isQuick(v) {
  return !!v.free && (v.daysMax ?? v.daysMin ?? Infinity) <= QUICK_MAX_DAYS;
}

// open — открытые нарушения с полем gain; возвращает их в порядке пути.
function orderPath(open) {
  const quick = open.filter(isQuick).sort((a, b) => (b.gain || 0) - (a.gain || 0) || b.risk - a.risk).slice(0, QUICK_FIRST);
  const rest = scoring.sortByRisk(open.filter((v) => !quick.includes(v)));
  return [...quick, ...rest];
}

// Сведения о здоровье не храним (миграция 0125, решение владельца): к шагам
// про медкнижки, медосмотры и информированное согласие файл не прикладываем.
const NO_EVIDENCE = /медицинск|медкниж|медосмотр|информированное согласие/i;

function evidenceAllowed(title) {
  return !NO_EVIDENCE.test(title || '');
}

// Раздел «Документов», куда ляжет файл шага: блоки матриц нарушений
// одинаковые во всех нишах (1 — юридическая база, 2 — санитария, …).
const BLOCK_CATEGORY = {
  1: 'Регистрационные документы',
  2: 'Санитарная документация',
  3: 'Оборудование',
  4: 'Персонал',
  5: 'Документы по персональным данным',
  6: 'Пожарная безопасность',
};

// sectionTitles — разделы «Документов» этой компании: файл в разделе, которого
// у неё нет, вкладка не покажет.
function categoryFor(block, sectionTitles) {
  const wanted = BLOCK_CATEGORY[block] || 'Дополнительно';
  if (!sectionTitles.length || sectionTitles.includes(wanted)) return wanted;
  return sectionTitles.includes('Дополнительно') ? 'Дополнительно' : sectionTitles[sectionTitles.length - 1];
}

module.exports = { orderPath, isQuick, evidenceAllowed, categoryFor, QUICK_FIRST };
