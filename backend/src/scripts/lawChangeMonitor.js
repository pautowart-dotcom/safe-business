require('dotenv').config();
const pool = require('../db/pool');

// Первый шаг клиентского платного мониторинга закона (карта фронтов, 03б,
// 31.08.2026) — только сбор кандидатов, без клиентского UI и без оплаты.
// Источник и контур — решение владельца 31.08.2026: сначала налоги/бизнес-
// статус (не санитарные/лицензионные требования, там источники и охват
// сильно другие). Источник проверен вручную curl'ом (WebFetch не достучался
// до *.gov.ru из этого окружения, прямое соединение — да): официальный
// портал опубликования правовых актов отдаёт RSS с реальными URL вида
// http://publication.pravo.gov.ru/api/rss?block=<block>&pageSize=<10|100|200>
// (только эти три значения pageSize подтверждены — другие отдают HTTP 400).
// block=president — федеральные законы публикуются там же, где указы
// президента (закон подписывается и публикуется президентом), это
// подтверждено на реальных данных: в выборке из последних 200 записей
// нашлось 6 подлинных поправок в НК РФ.
const FEED_URL = 'http://publication.pravo.gov.ru/api/rss?block=president&pageSize=200';

// Список сознательно узкий и предметный (налоги/бизнes-статус, не всё
// законодательство) — соответствует выбранному контуру. Расширять этот
// список — не то же самое, что расширять контур мониторинга: правки НК РФ
// иногда называются не "налог", а по номеру статьи, это не решить чистым
// списком слов, но для MVP-сигнала (не для истины) этого достаточно.
const KEYWORDS = ['налог', 'нк рф', 'патент', 'самозанят', 'усн', 'упрощен', 'страхов', 'нпд'];

function matchKeywords(title) {
  const lower = title.toLowerCase();
  return KEYWORDS.filter((kw) => lower.includes(kw));
}

const RU_MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

// pubDate приходит как "Tue, 04 Aug 2026 00:00:00 +03:00" — здесь всегда
// полночь МСК. new Date(...).toISOString() был бы багом: конвертация в UTC
// сдвигает такую дату на день назад (00:00 +03:00 = 21:00 предыдущих суток
// UTC) — нашёл это на реальных данных при проверке скрипта, не в проде.
// Поэтому день/месяц/год берём прямо из текста, без объекта Date.
function extractPublishedDate(pubDate) {
  const m = pubDate.match(/(\d{2}) (\w{3}) (\d{4})/);
  if (!m || !RU_MONTHS[m[2]]) return null;
  return `${m[3]}-${RU_MONTHS[m[2]]}-${m[1]}`;
}

// Мини-парсер RSS 2.0 регулярками — без новой npm-зависимости, формат
// проверен вручную на реальном ответе источника (плоские <item> без
// вложенных CDATA/namespace-полей). Если источник когда-нибудь сменит
// структуру ответа, эти регулярки перестанут находить <item> и main() ниже
// упадёт на 0 найденных элементов — не молча даст мусор.
function parseRssItems(xml) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  return items.map((block) => {
    const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    return { title: title.trim(), link: link.trim(), pubDate: pubDate.trim() };
  });
}

async function fetchCandidates() {
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`pravo.gov.ru RSS ответил ${res.status}`);
  const xml = await res.text();
  const items = parseRssItems(xml);
  if (items.length === 0) throw new Error('RSS-лента вернула 0 записей — источник мог сменить формат, парсер не проверял бы это молча');

  return items
    .map((item) => ({ ...item, matched: matchKeywords(item.title) }))
    .filter((item) => item.matched.length > 0 && item.link);
}

async function main() {
  const candidates = await fetchCandidates();

  let inserted = 0;
  for (const c of candidates) {
    const { rowCount } = await pool.query(
      `INSERT INTO law_change_candidates (source, source_block, title, doc_url, published_at, matched_keywords)
       VALUES ('pravo_gov_ru', 'president', $1, $2, $3, $4)
       ON CONFLICT (doc_url) DO NOTHING`,
      [c.title, c.link, extractPublishedDate(c.pubDate), c.matched]
    );
    inserted += rowCount;
  }

  console.log(`lawChangeMonitor: просмотрено кандидатов ${candidates.length}, новых добавлено ${inserted}`);

  // Heartbeat (03.09.2026, лента наблюдения) — пишем только при успешном
  // завершении (после fetchCandidates и вставки, до этой строки любая
  // ошибка ушла бы в catch у main() ниже и heartbeat не обновился бы) —
  // "проверили закон" должно значить, что проверка реально прошла, а не
  // просто что скрипт запустился.
  await pool.query(
    `INSERT INTO cron_heartbeats (job_key, last_run_at) VALUES ('law_change_monitor', now())
     ON CONFLICT (job_key) DO UPDATE SET last_run_at = now()`
  );
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('lawChangeMonitor упал:', err);
    pool.end().finally(() => process.exit(1));
  });

module.exports = { parseRssItems, matchKeywords, extractPublishedDate };
