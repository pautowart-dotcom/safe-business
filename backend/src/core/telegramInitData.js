// Проверка initData Telegram Mini App (18.10.2026) — по документации
// Telegram «Validating data received via the Mini App»:
// secret = HMAC_SHA256(key = "WebAppData", data = bot_token),
// hash   = hex(HMAC_SHA256(key = secret, data = data_check_string)),
// где data_check_string — все поля, кроме hash, «ключ=значение» по алфавиту
// через \n. Подделать без токена бота нельзя. auth_date не старше суток —
// чтобы утёкшая строка не работала вечно.
const crypto = require('crypto');

const MAX_AGE_SECONDS = 24 * 3600;

function isConfigured() {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

// Возвращает { id, username } пользователя Telegram или null, если подпись
// не сходится, данные устарели или формат не тот.
function verifyInitData(initData, { botToken = process.env.TELEGRAM_BOT_TOKEN, now = Date.now() } = {}) {
  if (!botToken || typeof initData !== 'string' || initData.length > 4096) return null;
  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(hash, 'hex'))) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || now / 1000 - authDate > MAX_AGE_SECONDS) return null;

  let user;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    return null;
  }
  if (!user || !Number.isSafeInteger(user.id)) return null;
  return { id: user.id, username: typeof user.username === 'string' ? user.username.slice(0, 64) : null };
}

module.exports = { verifyInitData, isConfigured, MAX_AGE_SECONDS };
