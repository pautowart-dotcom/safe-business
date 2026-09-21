// Яндекс SmartCaptcha, невидимый режим (21.09.2026): обычному человеку ничего
// не показывает, подозрительному — окно с заданием. Клиентский ключ задаётся
// при сборке (VITE_SMARTCAPTCHA_SITEKEY); без него функция сразу возвращает
// null и всё работает как раньше — сервер тоже проверяет только если у него
// есть свой ключ (backend/src/core/captcha.js).
const SITEKEY = import.meta.env.VITE_SMARTCAPTCHA_SITEKEY;
let scriptPromise = null;

function loadScript() {
  if (window.smartCaptcha) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://smartcaptcha.yandexcloud.net/captcha.js';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error('captcha script failed'));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

export async function getCaptchaToken() {
  if (!SITEKEY) return null;
  try {
    await loadScript();
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    const box = document.createElement('div');
    document.body.appendChild(box);
    let done = false;
    let widgetId;
    const finish = (token) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { window.smartCaptcha.destroy(widgetId); } catch { /* уже убран */ }
      box.remove();
      resolve(token);
    };
    const timer = setTimeout(() => finish(null), 60000);
    try {
      widgetId = window.smartCaptcha.render(box, {
        sitekey: SITEKEY,
        invisible: true,
        hl: 'ru',
        callback: (token) => finish(token),
      });
      window.smartCaptcha.subscribe(widgetId, 'network-error', () => finish(null));
      window.smartCaptcha.subscribe(widgetId, 'javascript-error', () => finish(null));
      window.smartCaptcha.execute(widgetId);
    } catch {
      finish(null);
    }
  });
}
