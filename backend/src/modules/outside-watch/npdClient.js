// Официальный API ФНС «Проверка статуса налогоплательщика НПД (самозанятого)».
// Описание (ФНС, v1.0.0 от 21.02.2019, прочитано 22.10.2026):
// npd.nalog.ru/html/sites/www.npd.nalog.ru/api_statusnpd_nalog_ru.pdf
//   POST https://statusnpd.nalog.ru:443/api/v1/tracker/taxpayer_status
//   { inn, requestDate: 'YYYY-MM-DD' } → { status: boolean, message }
//   Не чаще 2 запросов в минуту с одного IP; таймаут клиента — не меньше 60 с.
//   Ошибки — HTTP 422 с code: taxpayer.status.service.limited.error (лимит),
//   taxpayer.status.service.unavailable.error, validation.failed.
// Ключ не нужен. Вызывающий сам держит паузу между запросами (NPD_MIN_INTERVAL_MS).

const ENDPOINT = 'https://statusnpd.nalog.ru:443/api/v1/tracker/taxpayer_status';
const NPD_MIN_INTERVAL_MS = 31000;

async function checkSelfEmployed(inn, date = new Date()) {
  const digits = String(inn || '').trim();
  if (!/^\d{12}$/.test(digits)) {
    const err = new Error('ИНН самозанятого — 12 цифр');
    err.code = 'INVALID_INN';
    throw err;
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inn: digits, requestDate: date.toISOString().slice(0, 10) }),
    signal: AbortSignal.timeout(65000),
  });
  const json = await res.json().catch(() => null);
  if (res.ok && json && typeof json.status === 'boolean') {
    return { status: json.status, message: json.message || '' };
  }
  const err = new Error((json && json.message) || `ФНС: HTTP ${res.status}`);
  err.code = json && json.code === 'taxpayer.status.service.limited.error' ? 'RATE_LIMIT' : (json && json.code) || 'FETCH_FAILED';
  throw err;
}

module.exports = { checkSelfEmployed, NPD_MIN_INTERVAL_MS };
