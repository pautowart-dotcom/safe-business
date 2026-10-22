// «Переходник» к Checko API (https://checko.ru/integration/api) — открытые
// реестры по ИНН: ЕГРЮЛ/ЕГРИП, проверки (ЕРКНМ), арбитраж, ФССП, ЕФРСБ.
// Условия использования данных сохранены в docs/vendors/checko/ (22.10.2026):
// хранить у себя и показывать в своём приложении — можно.
//
// Отдельный модуль, чтобы поставщика можно было заменить (DaData, Фокус,
// API-ФНС), не трогая то, что строится поверх: наружу отдаём только сырой
// JSON по методу, разбор — в snapshot.js.
//
// Ключ — только из переменной окружения CHECKO_API_KEY, в файлы не пишем.
// Ключ передаётся POST'ом в теле, а не в строке запроса, чтобы не попадал
// в логи URL. Платятся только ответы 200; первые 100 запросов в сутки
// бесплатны — на один ИНН уходит до 5 запросов (см. METHODS).

const BASE_URL = 'https://api.checko.ru/v2/';

// Метод «карточки» зависит от длины ИНН: 10 цифр — организация, 12 — ИП.
const METHODS = ['card', 'inspections', 'legal-cases', 'enforcements', 'bankruptcy-messages'];

function normalizeInn(inn) {
  const digits = String(inn || '').trim();
  if (!/^\d{10}$|^\d{12}$/.test(digits)) {
    const err = new Error('ИНН должен состоять из 10 (организация) или 12 (ИП) цифр');
    err.code = 'INVALID_INN';
    throw err;
  }
  return digits;
}

function cardMethod(inn) {
  return inn.length === 10 ? 'company' : 'entrepreneur';
}

async function callMethod(method, inn, { apiKey = process.env.CHECKO_API_KEY, timeoutMs = 30000 } = {}) {
  if (!apiKey) {
    const err = new Error('Не задан CHECKO_API_KEY');
    err.code = 'NO_API_KEY';
    throw err;
  }
  const path = method === 'card' ? cardMethod(inn) : method;
  const res = await fetch(BASE_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: apiKey, inn }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Оставляем json = null — ниже уйдёт как ошибка с началом текста ответа.
  }
  if (!res.ok || !json) {
    const err = new Error(`Checko ${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
    err.code = res.status === 429 ? 'RATE_LIMIT' : 'FETCH_FAILED';
    err.status = res.status;
    throw err;
  }
  return json;
}

// Все методы по одному ИНН. Ошибка одного метода не роняет остальные —
// в снимке будет видно, какой источник не ответил.
async function fetchAllByInn(rawInn, opts) {
  const inn = normalizeInn(rawInn);
  const results = {};
  for (const method of METHODS) {
    try {
      results[method] = { ok: true, json: await callMethod(method, inn, opts) };
    } catch (err) {
      results[method] = { ok: false, error: err.message, code: err.code };
      if (err.code === 'NO_API_KEY') break;
    }
  }
  return { inn, fetchedAt: new Date().toISOString(), results };
}

module.exports = { METHODS, normalizeInn, cardMethod, callMethod, fetchAllByInn };
