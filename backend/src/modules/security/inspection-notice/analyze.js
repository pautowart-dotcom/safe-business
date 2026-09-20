// Разбор бумаги от проверяющего (предписание, акт, протокол, уведомление) —
// 20.09.2026, идея владельца: не отдельный продукт, а часть экосистемы
// "Безопасного бизнеса": результат разбора заполняет запись в "Истории
// проверок", срок становится дедлайном, упомянутые нормы связываются с тем,
// что уже есть у компании (нарушения из теста, шаблоны документов).
//
// Дисциплина та же, что у остального ИИ в проекте: цифры и даты берёт
// детерминированный код (regex по тексту), ИИ только формулирует простым
// языком, что это за бумага и чего она требует, и ничего не решает за
// человека. Юридической консультации и стратегии защиты здесь нет и не
// будет — только "что написано в бумаге" и куда идти за настоящей помощью.
//
// Файл не хранится: анализ живёт только в ответе на запрос, человек сам
// решает, что сохранить в историю (структурные поля + заметка, шифруется).

const AUTHORITIES = ['rospotrebnadzor', 'fire_inspection', 'labor_inspection', 'roskomnadzor', 'tax_inspection', 'other'];
const AREAS = ['sanitary', 'fire', 'personal_data', 'labor', 'tax_cash', 'consumer_rights', 'licenses_waste', 'other'];
const KINDS = ['order', 'protocol', 'act', 'notice', 'other'];

const AUTHORITY_PATTERNS = [
  ['rospotrebnadzor', /роспотребнадзор|управлени\S* федеральной службы по надзору в сфере защиты прав потребителей/gi],
  // \b в JS не видит границ слов у кириллицы — вместо него lookaround.
  ['fire_inspection', /(?<![а-яёa-z])мчс(?![а-яёa-z])|надзорной деятельности|государственн\S* пожарн\S* надзор/gi],
  ['labor_inspection', /инспекци\S* труда|трудов\S* инспекци/gi],
  ['roskomnadzor', /роскомнадзор/gi],
  ['tax_inspection', /(?<![а-яёa-z])(?:и)?фнс(?![а-яёa-z])|налогов\S* (?:инспекци|орган|служб)/gi],
];

const AREA_PATTERNS = [
  ['sanitary', /санитарн|санпин|дезинфек|стерилизац/i],
  ['fire', /пожар|огнетушител|эвакуац/i],
  ['personal_data', /персональн\S* данн|152-фз/i],
  ['labor', /охран\S* труда|трудов\S* (?:договор|кодекс)|сОУТ|инструктаж/i],
  ['tax_cash', /контрольно-кассов|онлайн-касс|54-фз|налогов\S* деклараци/i],
  ['consumer_rights', /прав\S* потребител|уголок потребител/i],
  ['licenses_waste', /отход|лицензи/i],
];

function pad(n) { return String(n).padStart(2, '0'); }

function tomorrowIso(todayIso) {
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function isValidIsoDate(iso) {
  return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime());
}

// Даты вида ДД.ММ.ГГГГ (так пишут в официальных бумагах). Год ограничен
// разумным окном, чтобы не принять за дату номер документа вроде 12.03.0001.
function findDates(text) {
  const found = [];
  for (const m of text.matchAll(/\b(\d{1,2})\.(\d{2})\.(20\d{2})\b/g)) {
    const iso = `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    if (isValidIsoDate(iso)) found.push({ iso, index: m.index });
  }
  return found;
}

// Срок исправления — дата в предложении со словами "срок"/"не позднее"/
// "до". Из нескольких берём ближайший будущий (todayIso), иначе null — не
// гадаем, если не уверены, пусть человек введёт сам.
function guessDeadline(text, todayIso) {
  const candidates = [];
  for (const sentence of text.split(/(?<=[.;])\s+|\n+/)) {
    if (!/(срок|не позднее|(?<![а-яё])до\s)/i.test(sentence)) continue;
    for (const d of findDates(sentence)) candidates.push(d.iso);
  }
  const future = [...new Set(candidates)].filter((d) => d >= todayIso).sort();
  return future[0] || null;
}

function guessAuthority(text) {
  let best = null;
  let bestCount = 0;
  for (const [key, re] of AUTHORITY_PATTERNS) {
    const count = (text.match(re) || []).length;
    if (count > bestCount) { best = key; bestCount = count; }
  }
  return best;
}

function guessKind(text) {
  if (/предписани/i.test(text)) return 'order';
  if (/протокол об административн/i.test(text)) return 'protocol';
  if (/(?<![а-яёa-z])акт(?![а-яёa-z]).{0,30}проверк|акт выездн/i.test(text)) return 'act';
  if (/уведомлени|требовани/i.test(text)) return 'notice';
  return 'other';
}

// Суммы рядом со словом "штраф": "штраф ... 20 000 руб." — первая найденная.
function guessFine(text) {
  const idx = text.search(/штраф/i);
  if (idx === -1) return null;
  const window = text.slice(idx, idx + 200);
  const m = window.match(/(\d{1,3}(?:[\s ]\d{3})+|\d{3,7})(?:[.,]\d{2})?\s*(?:руб|₽)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/[\s ]/g, ''));
  return Number.isFinite(n) && n > 0 && n <= 1e9 ? n : null;
}

function guessAreas(text) {
  return AREA_PATTERNS.filter(([, re]) => re.test(text)).map(([k]) => k);
}

// Статьи КоАП только для показа ("в бумаге упомянуты...") — у продукта нет
// реестра статей КоАП, чтобы связывать с чем-то, поэтому не выдаём это за
// связку с тестом.
function findKoapArticles(text) {
  const set = new Set();
  for (const m of text.matchAll(/(\d{1,2}\.\d{1,2}(?:\.\d+)?)\s*(?:ч(?:асть|\.)?\s*\d+\s*)?КоАП/gi)) set.add(m[1]);
  for (const m of text.matchAll(/КоАП\s*РФ[^.]{0,40}?ст(?:атья|атьи|\.)\s*(\d{1,2}\.\d{1,2}(?:\.\d+)?)/gi)) set.add(m[1]);
  return [...set].slice(0, 8);
}

// Всё, что можно вытащить без ИИ.
function extractHints(text, todayIso) {
  const dates = findDates(text);
  return {
    kind: guessKind(text),
    authority: guessAuthority(text),
    deadlineDate: guessDeadline(text, todayIso),
    fineAmount: guessFine(text),
    areas: guessAreas(text),
    koapArticles: findKoapArticles(text),
    // Дата документа — ПЕРВАЯ дата в шапке (первые 600 символов: "ПРЕДПИСАНИЕ
    // № … от ДД.ММ.ГГГГ"), а не самая ранняя во всём тексте — в теле бумаги
    // цитируются старые законы ("от 27.07.2006"), самая ранняя дата почти
    // всегда оказывается датой закона. Не из будущего и не старше 2015 г.
    // Только подсказка, человек подтверждает в форме.
    documentDate: (dates.find((d) => d.index < 600 && d.iso >= '2015-01-01' && d.iso <= tomorrowIso(todayIso)) || {}).iso || null,
  };
}

const AI_SYSTEM_PROMPT =
  'Ты помогаешь владельцу малого бизнеса разобраться, что написано в бумаге от проверяющего органа (предписание, акт, ' +
  'протокол, уведомление). Тебе дают текст бумаги и подсказки, найденные программой. Отвечай ТОЛЬКО JSON-объектом без ' +
  'пояснений и без обрамления, ключи: summary — 2-4 предложения простым языком: что это за бумага, кто её выдал, чего ' +
  'требует и к какому сроку; findings — список из 3-8 коротких пунктов "что именно вменяют/требуют" своими словами; ' +
  'kind — одно из order, protocol, act, notice, other; authority — одно из rospotrebnadzor, fire_inspection, ' +
  'labor_inspection, roskomnadzor, tax_inspection, other; inspectedOn, deadlineDate — даты в формате ГГГГ-ММ-ДД или null; ' +
  'fineAmount — число рублей или null. Используй ТОЛЬКО то, что написано в тексте, ничего не выдумывай: статьи, суммы и ' +
  'сроки бери из текста, если их нет — null. Не давай юридических советов, не предлагай, как оспорить или обойти ' +
  'требование, не обещай исхода. Если текст непонятен или обрезан — так и напиши в summary.';

function buildAiPrompt(text, hints) {
  const hintLines = [
    `Подсказки программы (могут быть неточны): вид=${hints.kind}, орган=${hints.authority || 'не определён'}, ` +
      `срок=${hints.deadlineDate || 'не найден'}, штраф=${hints.fineAmount || 'не найден'}`,
  ];
  return `${hintLines.join('\n')}\n\nТекст бумаги:\n${text}`;
}

function parseAiJson(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

// Ответ ИИ не доверяется слепо: enum-значения и даты проверяются, лишнее
// отбрасывается, а там, где ИИ ошибся или промолчал, остаются детерминированные
// подсказки. Возвращает единый объект для показа.
function mergeAnalysis(hints, aiRaw) {
  const ai = parseAiJson(aiRaw);
  const pickEnum = (v, list) => (list.includes(v) ? v : null);
  const pickDate = (v) => (isValidIsoDate(v) && v >= '2000-01-01' ? v : null);
  const aiFine = ai && Number.isFinite(Number(ai.fineAmount)) && Number(ai.fineAmount) >= 0 && Number(ai.fineAmount) <= 1e9
    ? Number(ai.fineAmount) || null
    : null;

  const findings = ai && Array.isArray(ai.findings)
    ? ai.findings.filter((f) => typeof f === 'string' && f.trim()).map((f) => f.trim().slice(0, 300)).slice(0, 8)
    : [];

  return {
    summary: ai && typeof ai.summary === 'string' && ai.summary.trim() ? ai.summary.trim().slice(0, 1200) : null,
    findings,
    kind: (ai && pickEnum(ai.kind, KINDS)) || hints.kind,
    authority: (ai && pickEnum(ai.authority, AUTHORITIES)) || hints.authority || 'other',
    // Даты и сумма: детерминированная подсказка приоритетнее — она взята
    // прямо из текста; ИИ используем только как запасной вариант.
    inspectedOn: hints.documentDate || (ai && pickDate(ai.inspectedOn)) || null,
    deadlineDate: hints.deadlineDate || (ai && pickDate(ai.deadlineDate)) || null,
    fineAmount: hints.fineAmount || aiFine,
    areas: hints.areas.filter((a) => AREAS.includes(a)),
    koapArticles: hints.koapArticles,
    aiUsed: !!ai,
  };
}

// Итог проверки для формы "Истории проверок" по виду бумаги.
function suggestOutcome(analysis) {
  if (analysis.kind === 'order' || analysis.deadlineDate) return 'order';
  if (analysis.kind === 'protocol' || analysis.fineAmount) return 'protocol';
  return '';
}

module.exports = {
  AUTHORITIES, AREAS, KINDS,
  findDates, guessDeadline, guessAuthority, guessKind, guessFine, guessAreas, findKoapArticles,
  extractHints, buildAiPrompt, parseAiJson, mergeAnalysis, suggestOutcome, AI_SYSTEM_PROMPT,
};
