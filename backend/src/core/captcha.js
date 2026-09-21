// Яндекс SmartCaptcha (21.09.2026, шаг 2 защиты от массового обхода).
// Виджет на странице невидимый: обычному человеку ничего не показывает,
// подозрительному — картинку-задание. Здесь — серверная проверка токена.
//
// Включается только если в .env задан SMARTCAPTCHA_SERVER_KEY (серверный
// ключ из консоли Яндекс Облака; клиентский ключ — VITE_SMARTCAPTCHA_SITEKEY
// на фронте). Без ключа проверка отключена, всё работает как раньше.
//
// Если сам сервис капчи недоступен — пропускаем (fail open): лучше пустить
// человека без проверки, чем остановить регистрацию из-за чужого сбоя.
// Лимиты по IP и темп прохождения теста при этом продолжают работать.
const VALIDATE_URL = 'https://smartcaptcha.yandexcloud.net/validate';

function isCaptchaEnabled() {
  return !!process.env.SMARTCAPTCHA_SERVER_KEY;
}

async function verifyCaptcha(token, ip) {
  if (!isCaptchaEnabled()) return { ok: true, skipped: true };
  if (!token || typeof token !== 'string') return { ok: false };
  try {
    const body = new URLSearchParams({ secret: process.env.SMARTCAPTCHA_SERVER_KEY, token, ip: ip || '' });
    const res = await fetch(VALIDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: true, skipped: true, unavailable: true };
    const json = await res.json();
    return { ok: json.status === 'ok' };
  } catch (err) {
    console.error('SmartCaptcha недоступна, пропускаем проверку:', err.message);
    return { ok: true, skipped: true, unavailable: true };
  }
}

// Express-обработчик: 400 с captchaFailed, если токен не прошёл проверку.
async function requireCaptcha(req, res, next) {
  const result = await verifyCaptcha(req.body && req.body.captchaToken, req.ip);
  if (result.ok) return next();
  return res.status(400).json({ error: 'Не удалось пройти проверку «я не робот». Обновите страницу и попробуйте снова.', captchaFailed: true });
}

module.exports = { isCaptchaEnabled, verifyCaptcha, requireCaptcha };
