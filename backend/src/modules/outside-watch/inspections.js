// «К вам проверка — вот что подготовить» (26.10.2026, стратегия плана
// 26.10: сила подписки «к проверке готов»). Из записей реестра проверок
// (ЕРКНМ через Checko) берём предстоящие: дата, орган, плановая или нет — и
// связываем орган с открытыми шагами «Пути до 100 %» по его теме и памяткой
// «Если пришла проверка» (security/content/inspectionGuides.js).
//
// Имена полей записи Checko на живом ответе НЕ сверены (у первого ИНН
// записей не было) — читаем осторожно, по нескольким вариантам и по началу
// имени поля. Не нашли дату — запись не считаем предстоящей, и человек
// получит прежнее «откройте proverki.gov.ru по ИНН». Видны только проверки,
// которые уже внесены в реестр (плановые — заранее, по плану года).

// Орган → памятка и блоки матрицы нарушений, которые он смотрит.
const AUTHORITIES = [
  { re: /потребнадзор|санитарн|эпидем|прав потребителей|благополучия человека/i, guide: 'rospotrebnadzor', name: 'Роспотребнадзор', blocks: [2], topic: 'санитария' },
  { re: /МЧС|пожар|чрезвычайн/i, guide: 'fire_inspection', name: 'пожарный надзор (МЧС)', blocks: [6], topic: 'пожарная безопасность и помещение' },
  { re: /труд/i, guide: 'labor_inspection', name: 'трудовая инспекция', blocks: [4], topic: 'персонал' },
  { re: /роскомнадзор|связи|массовых коммуникаций/i, guide: 'roskomnadzor', name: 'Роскомнадзор', blocks: [5], topic: 'персональные данные' },
  { re: /налог|ФНС/i, guide: 'tax_inspection', name: 'налоговая', blocks: [9], topic: 'финансы' },
];

function pick(rec, names, prefix) {
  for (const n of names) if (rec[n] != null && rec[n] !== '') return rec[n];
  if (prefix) {
    const key = Object.keys(rec).find((k) => k.startsWith(prefix));
    if (key) return rec[key];
  }
  return null;
}

function text(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'object') return text(v.Наим || v.НаимПолн || v.НаимСокр || v.Название || null);
  return String(v);
}

function isoDate(v) {
  const s = text(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function parseRecord(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const date = isoDate(pick(rec, ['ДатаНач', 'ДатаНачала', 'ДатаПров', 'Дата'], 'Дата'));
  const organ = text(pick(rec, ['ОргКонтр', 'Орган', 'КонтрОрган', 'ОрганКонтр'], 'Орг'));
  const kind = text(pick(rec, ['Тип', 'ТипПров', 'ВидПров', 'Вид'], 'Тип'));
  const number = text(pick(rec, ['Номер', 'УчетНомер', 'УчНомер', 'ЕРКНМ'], 'Номер'));
  return { date, organ, kind, number };
}

function authorityFor(organ) {
  return AUTHORITIES.find((a) => a.re.test(organ || '')) || null;
}

// result — ответ Checko по методу inspections ({ ok, json }); today — YYYY-MM-DD.
// Предстоящие (дата не раньше сегодня) — без ФИО, только орган и дата.
function upcomingInspections(result, today) {
  const data = result && result.ok && result.json && result.json.data;
  const records = data && Array.isArray(data.Записи) ? data.Записи : [];
  return records
    .map(parseRecord)
    .filter((r) => r && r.date && r.date >= today)
    .map((r) => ({
      id: r.number || `${r.date}:${r.organ || ''}`,
      date: r.date,
      organ: r.organ,
      planned: r.kind ? /план/i.test(r.kind) && !/внеплан/i.test(r.kind) : null,
      guide: authorityFor(r.organ)?.guide || null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function ruDate(iso) {
  return iso.split('-').reverse().join('.');
}

// openByBlock — { [block]: число открытых шагов }.
function prepareText(insp, openByBlock) {
  const a = authorityFor(insp.organ);
  const who = insp.organ || a?.name || 'контрольный орган';
  const kind = insp.planned === true ? 'Плановая проверка' : 'Проверка';
  const title = `${kind}: ${who}, с ${ruDate(insp.date)}`;
  const parts = ['Запись есть в реестре проверок.'];
  if (a) {
    const open = a.blocks.reduce((s, b) => s + (openByBlock[b] || 0), 0);
    parts.push(open > 0
      ? `Что подготовить: в «Шагах» по теме «${a.topic}» открыто: ${open} — начните с них.`
      : `По теме «${a.topic}» открытых шагов нет — проверьте, что журналы и документы на месте.`);
    parts.push('Памятка «Если пришла проверка» — в разделе «Безопасность», вкладка «Проверки».');
  } else {
    parts.push('Откройте proverki.gov.ru по ИНН: там предмет проверки. Памятка «Если пришла проверка» — в разделе «Безопасность», вкладка «Проверки».');
  }
  return { title, body: parts.join(' ') };
}

module.exports = { upcomingInspections, prepareText, parseRecord, authorityFor, AUTHORITIES };
