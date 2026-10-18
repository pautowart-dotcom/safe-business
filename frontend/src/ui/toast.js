// Всплывающее подтверждение сверху (18.10.2026, вид приложения): «Отмечено»,
// «Сохранено». Без React-контекста — один элемент в body, вызывается
// откуда угодно: toast('Отмечено').
let el = null;
let timer = null;

export default function toast(message, ms = 1800) {
  if (typeof document === 'undefined') return;
  if (!el) {
    el = document.createElement('div');
    el.className = 'ui-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = message;
  // Перезапуск показа, если предыдущее ещё висит.
  el.classList.remove('ui-toast-on');
  void el.offsetWidth;
  el.classList.add('ui-toast-on');
  if (navigator.vibrate) {
    try { navigator.vibrate(12); } catch { /* не все браузеры разрешают */ }
  }
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('ui-toast-on'), ms);
}
