const crypto = require('crypto');

// Обёртка над ЮKassa REST API (https://yookassa.ru/developers/api). Одни и
// те же shopId/secretKey работают и в тестовом, и в боевом магазине — режим
// определяется только тем, какие ключи заданы в .env (тестовые начинаются
// с test_), никакого отдельного "test mode" в коде нет.
const BASE_URL = 'https://api.yookassa.ru/v3';

function authHeader() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    throw new Error('ЮKassa не настроена: заполните YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY в .env');
  }
  return 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64');
}

async function request(path, { method = 'GET', body, idempotenceKey } = {}) {
  const headers = { Authorization: authHeader(), 'Content-Type': 'application/json' };
  if (idempotenceKey) headers['Idempotence-Key'] = idempotenceKey;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.description || `ЮKassa вернула ошибку (${res.status})`);
    err.yookassaError = data;
    throw err;
  }
  return data;
}

// paymentMethodId передан → повторное автосписание уже сохранённым способом
// оплаты, без участия клиента (confirmation не нужен). Не передан → первый
// платёж, клиента ведём на страницу оплаты (confirmation.confirmation_url) и
// просим ЮKassa сохранить способ оплаты для будущих автосписаний.
async function createPayment({ amountRub, description, returnUrl, savePaymentMethod, paymentMethodId, metadata }) {
  const body = {
    amount: { value: amountRub.toFixed(2), currency: 'RUB' },
    capture: true,
    description,
    metadata,
  };
  if (paymentMethodId) {
    body.payment_method_id = paymentMethodId;
  } else {
    body.confirmation = { type: 'redirect', return_url: returnUrl };
    body.save_payment_method = !!savePaymentMethod;
  }
  return request('/payments', { method: 'POST', body, idempotenceKey: crypto.randomUUID() });
}

// Вебхуки ЮKassa не подписаны — по рекомендации самой ЮKassa перепроверяем
// платёж напрямую через API по его id, не доверяя телу входящего запроса.
async function getPayment(paymentId) {
  return request(`/payments/${paymentId}`);
}

module.exports = { createPayment, getPayment };
