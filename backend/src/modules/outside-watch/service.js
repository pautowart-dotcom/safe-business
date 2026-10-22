// «Ваш бизнес снаружи» — общая логика для роута (бесплатный снимок) и
// ежедневного скрипта (наблюдение по подписке): снять снимок, сохранить,
// сравнить с прошлым и превратить разницу в события для уведомлений.
//
// Только СВОЙ бизнес (решение владельца 22.10.2026): ИНН подтверждается
// галочкой «это мой бизнес», сверяется с реквизитами из «Документов», если
// они уже введены, и меняется не чаще раза в 30 дней. Других людей
// (мастеров, контрагентов) не проверяем.

const pool = require('../../db/pool');
const { encrypt, decrypt } = require('../../core/crypto');
const { fetchAllByInn, normalizeInn } = require('./checkoClient');
const { buildFindings } = require('./findings');

// Бесплатно у Checko 100 запросов в сутки, на снимок уходит 5. Потолок
// с запасом: при его достижении новые снимки ждут следующего дня (платный
// баланс без решения владельца не тратим — п. «Контроль расходов» условий).
const DAILY_SNAPSHOT_CAP = Number(process.env.OUTSIDE_WATCH_DAILY_CAP || 18);
const INN_CHANGE_DAYS = 30;
const LIST_METHODS = ['inspections', 'legal-cases', 'enforcements', 'bankruptcy-messages'];

function enabledFor(company) {
  return process.env.OUTSIDE_WATCH_ENABLED === 'true' || !!company?.is_test;
}

function listCount(result) {
  const data = result && result.ok && result.json && result.json.data;
  if (!data || !Object.keys(data).length) return null; // источник не нашёл лицо
  if (typeof data.ЗапВсего === 'number') return data.ЗапВсего;
  return Array.isArray(data.Записи) ? data.Записи.length : null;
}

// Короткая сводка без ФИО — по ней сравниваем «было — стало».
function summarize(snapshot) {
  const r = snapshot.results || {};
  const card = (r.card && r.card.ok && r.card.json && r.card.json.data) || {};
  const counts = {};
  for (const m of LIST_METHODS) counts[m] = listCount(r[m]);
  return {
    inn: snapshot.inn,
    fetchedAt: snapshot.fetchedAt,
    status: (card.Статус && card.Статус.Наим) || null,
    okved: (card.ОКВЭД && card.ОКВЭД.Код) || null,
    rmsp: (card.РМСП && card.РМСП.Кат) || null,
    riskFlags: !!(card.МассРуковод || card.МассУчред),
    unfairSupplier: !!card.НедобПост,
    trademarks: Array.isArray(card.ТоварЗнак) ? card.ТоварЗнак.length : null,
    counts,
  };
}

const COUNT_EVENTS = {
  inspections: { title: 'Появилась запись о проверке', url: 'https://proverki.gov.ru', what: 'Откройте proverki.gov.ru по ИНН: там дата, орган и что проверяют.' },
  'legal-cases': { title: 'Появилось арбитражное дело с вашим участием', url: 'https://kad.arbitr.ru', what: 'Откройте kad.arbitr.ru по ИНН: посмотрите, в какой вы роли — истец или ответчик — и когда заседание.' },
  enforcements: { title: 'Появилось исполнительное производство', url: 'https://fssp.gov.ru', what: 'Проверьте на fssp.gov.ru: непогашенный долг может закончиться блокировкой счёта.' },
  'bankruptcy-messages': { title: 'Появилось сообщение о банкротстве', url: 'https://bankrot.fedresurs.ru', what: 'Откройте bankrot.fedresurs.ru по ИНН и посоветуйтесь с юристом.' },
};

// Разница двух сводок → события. Срабатываем только на появление нового
// или изменение реквизитов: «дело закрылось» не повод будить человека.
function diffSummaries(prev, next) {
  if (!prev) return [];
  const events = [];
  for (const [method, ev] of Object.entries(COUNT_EVENTS)) {
    const a = prev.counts?.[method];
    const b = next.counts?.[method];
    if (typeof a === 'number' && typeof b === 'number' && b > a) {
      events.push({ key: `count:${method}:${b}`, title: ev.title, body: `Было записей: ${a}, сейчас: ${b}. ${ev.what}`, url: ev.url });
    }
  }
  if (prev.status && next.status && prev.status !== next.status) {
    events.push({ key: `status:${next.status}`, title: `Статус в реестре: «${next.status}»`, body: `Раньше был «${prev.status}». Если вы этого не меняли — проверьте выписку на egrul.nalog.ru и обратитесь в свою налоговую.`, url: 'https://egrul.nalog.ru' });
  }
  if (prev.okved && next.okved && prev.okved !== next.okved) {
    events.push({ key: `okved:${next.okved}`, title: 'В реестре изменился основной ОКВЭД', body: `Был ${prev.okved}, стал ${next.okved}. Если вы этого не меняли — проверьте выписку и обратитесь в свою налоговую.`, url: 'https://egrul.nalog.ru' });
  }
  if (prev.rmsp && !next.rmsp) {
    events.push({ key: 'rmsp:lost', title: 'Вы пропали из реестра малого бизнеса', body: 'Без статуса МСП не действуют некоторые льготы, например замена первого штрафа предупреждением. Проверьте rmsp.nalog.ru.', url: 'https://rmsp.nalog.ru' });
  }
  if (!prev.riskFlags && next.riskFlags) {
    events.push({ key: 'riskflags', title: 'В реестре появилась отметка «массовый руководитель/учредитель»', body: 'Банки и контрагенты это видят. Проверьте выписку; если это ошибка — обратитесь в налоговую.', url: 'https://egrul.nalog.ru' });
  }
  if (!prev.unfairSupplier && next.unfairSupplier) {
    events.push({ key: 'unfair', title: 'Вы попали в реестр недобросовестных поставщиков', body: 'Этот реестр ведёт ФАС (госзакупки). Проверьте запись на zakupki.gov.ru; оспаривается через ФАС или суд.', url: 'https://zakupki.gov.ru' });
  }
  return events;
}

async function documentsInn(companyId) {
  const { rows } = await pool.query('SELECT document_details_enc FROM companies WHERE id = $1', [companyId]);
  if (!rows[0]?.document_details_enc) return null;
  try {
    const inn = String(JSON.parse(decrypt(rows[0].document_details_enc))?.inn || '').trim();
    return /^\d{10}$|^\d{12}$/.test(inn) ? inn : null;
  } catch {
    return null;
  }
}

async function getCompanyInn(companyId) {
  const { rows } = await pool.query('SELECT outside_inn_enc, outside_inn_confirmed_at FROM companies WHERE id = $1', [companyId]);
  const row = rows[0] || {};
  return { inn: row.outside_inn_enc ? decrypt(row.outside_inn_enc) : null, confirmedAt: row.outside_inn_confirmed_at || null };
}

// Сохранить ИНН своего бизнеса. Ошибки — с code для ответа роута.
async function setCompanyInn(companyId, rawInn, { confirmOwn } = {}) {
  const inn = normalizeInn(rawInn);
  const current = await getCompanyInn(companyId);
  if (current.inn === inn) return inn;
  if (!confirmOwn) {
    const err = new Error('Подтвердите, что это ИНН вашего ИП или организации');
    err.code = 'CONFIRM_REQUIRED';
    throw err;
  }
  const docInn = await documentsInn(companyId);
  if (docInn && docInn !== inn) {
    const err = new Error('ИНН отличается от того, что указан в реквизитах ваших документов. Можно указать только свой бизнес.');
    err.code = 'INN_MISMATCH';
    throw err;
  }
  if (current.inn && current.confirmedAt && Date.now() - new Date(current.confirmedAt).getTime() < INN_CHANGE_DAYS * 24 * 3600 * 1000) {
    const err = new Error(`ИНН можно менять не чаще раза в ${INN_CHANGE_DAYS} дней — напишите в поддержку, если ошиблись.`);
    err.code = 'INN_CHANGE_LIMIT';
    throw err;
  }
  await pool.query('UPDATE companies SET outside_inn_enc = $2, outside_inn_confirmed_at = now() WHERE id = $1', [companyId, encrypt(inn)]);
  return inn;
}

async function latestSnapshot(companyId) {
  const { rows } = await pool.query(
    `SELECT id, source, summary, findings, created_at FROM outside_watch_snapshots
     WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [companyId]
  );
  return rows[0] || null;
}

async function snapshotsToday() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM outside_watch_snapshots WHERE created_at >= date_trunc('day', now())`
  );
  return rows[0].n;
}

// Снять и сохранить снимок. Возвращает { row, prevSummary } — prevSummary
// нужен скрипту наблюдения для diffSummaries.
async function takeSnapshot(companyId, inn, source) {
  const prev = await latestSnapshot(companyId);
  const snapshot = await fetchAllByInn(inn);
  const summary = summarize(snapshot);
  const findings = buildFindings(snapshot);
  const { rows } = await pool.query(
    `INSERT INTO outside_watch_snapshots (company_id, source, summary, findings)
     VALUES ($1, $2, $3, $4) RETURNING id, source, summary, findings, created_at`,
    [companyId, source, summary, JSON.stringify(findings)]
  );
  // Храним только последние снимки: для сравнения нужен один прошлый.
  await pool.query(
    `DELETE FROM outside_watch_snapshots WHERE company_id = $1 AND id NOT IN (
       SELECT id FROM outside_watch_snapshots WHERE company_id = $1 ORDER BY created_at DESC LIMIT 3)`,
    [companyId]
  );
  // Если ИНН поменяли — прошлый снимок про другой бизнес, сравнивать нечего.
  const prevSummary = prev && prev.summary && prev.summary.inn === summary.inn ? prev.summary : null;
  return { row: rows[0], prevSummary };
}

module.exports = {
  DAILY_SNAPSHOT_CAP,
  enabledFor,
  summarize,
  diffSummaries,
  documentsInn,
  getCompanyInn,
  setCompanyInn,
  latestSnapshot,
  snapshotsToday,
  takeSnapshot,
};
