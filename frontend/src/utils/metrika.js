// Цели Яндекс Метрики в приложении (02.10.2026). Сам счётчик грузит
// /cookie-notice.js (общий с лендингом, подключён в index.html) — и только
// после согласия на cookie. Нет согласия — window.ym не существует, и цель
// просто не отправляется.
const METRIKA_ID = 112875830;

export function reachGoal(name) {
  try {
    if (typeof window.ym === 'function') window.ym(METRIKA_ID, 'reachGoal', name);
  } catch {
    // аналитика не должна ломать интерфейс
  }
}
