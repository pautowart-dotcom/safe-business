// Telegram Mini App (18.10.2026). Кабинет открывается кнопкой в боте —
// Telegram передаёт подписанные данные (initData) в адресе после «#».
// Скрипт Telegram грузим только внутри Telegram: обычным пользователям
// браузера сторонний скрипт не нужен.
const FLAG = 'tgMiniApp';
const SCRIPT = 'https://telegram.org/js/telegram-web-app.js';

function detect() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.location.hash.includes('tgWebAppData')) {
      sessionStorage.setItem(FLAG, '1');
      return true;
    }
    return sessionStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

export const inTelegram = detect();

let ready = null;
// Promise<WebApp | null>. Вызывать сколько угодно раз — скрипт грузится один.
export function telegramReady() {
  if (!inTelegram) return Promise.resolve(null);
  if (ready) return ready;
  ready = new Promise((resolve) => {
    if (window.Telegram?.WebApp) return resolve(window.Telegram.WebApp);
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve(window.Telegram?.WebApp || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  }).then((app) => {
    if (!app) return null;
    try {
      app.ready();
      app.expand();
      // Цвет шапки и фона Telegram — как у приложения (PAGE_BG), чтобы не
      // было белой полосы над нашим серым фоном.
      app.setHeaderColor?.('#E7E9ED');
      app.setBackgroundColor?.('#E7E9ED');
      app.setBottomBarColor?.('#FFFFFF');
      // Иначе свайп вниз по списку закрывает всё приложение.
      app.disableVerticalSwipes?.();
    } catch { /* старые версии Telegram — без этих методов */ }
    return app;
  });
  return ready;
}

export function telegramInitData() {
  return window.Telegram?.WebApp?.initData || '';
}

// Короткий отклик, как у системных кнопок. kind: 'success' | 'light'.
export function haptic(kind = 'light') {
  const h = window.Telegram?.WebApp?.HapticFeedback;
  if (!h) return false;
  try {
    if (kind === 'success') h.notificationOccurred('success');
    else h.impactOccurred('light');
    return true;
  } catch {
    return false;
  }
}

// Системная кнопка «Назад» Telegram вместо нашей стрелки в шапке.
export function setTelegramBack(visible, onClick) {
  const b = window.Telegram?.WebApp?.BackButton;
  if (!b) return () => {};
  if (!visible) {
    b.hide();
    return () => {};
  }
  b.onClick(onClick);
  b.show();
  return () => b.offClick(onClick);
}
