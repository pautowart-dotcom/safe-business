// Уведомление о cookie и подключение Яндекс Метрики на лендинге (21.09.2026).
//
// Метрика ставит свои cookie, поэтому загружается только после нажатия
// «Принять». «Только необходимые» — счётчик не грузится вообще. Выбор хранится
// в localStorage под ключом cookie_consent: 'all' или 'necessary' (прежний
// ключ cookie_notice_ok от одной кнопки «Понятно» считается как 'necessary').
//
// Пока METRIKA_ID пустой, счётчика нет, уведомление остаётся информационным
// с одной кнопкой — как до подключения. Номер счётчика — не секрет.
// Вебвизор выключен намеренно: он записывает действия посетителей.
(function () {
  var METRIKA_ID = '112875830';
  var KEY = 'cookie_consent';
  var OLD_KEY = 'cookie_notice_ok';

  function read() {
    try {
      var v = window.localStorage.getItem(KEY);
      if (v) return v;
      if (window.localStorage.getItem(OLD_KEY) === '1') return 'necessary';
    } catch (e) {}
    return null;
  }
  function save(v) {
    try { window.localStorage.setItem(KEY, v); } catch (e) {}
  }

  function loadMetrika() {
    if (!METRIKA_ID || window.__metrikaLoaded) return;
    window.__metrikaLoaded = true;
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) return; }
      k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
    window.ym(METRIKA_ID, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false });

    // Цели: переход к тесту и к регистрации — по кликам на ссылки.
    document.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (href.indexOf('/lk/audit') === 0) window.ym(METRIKA_ID, 'reachGoal', 'start_test');
      else if (href.indexOf('/lk/login?mode=register') === 0) window.ym(METRIKA_ID, 'reachGoal', 'register_click');
    });
  }

  var saved = read();
  if (saved === 'all') { loadMetrika(); return; }
  if (saved) return;

  function show() {
    if (document.getElementById('cookie-notice')) return;
    var box = document.createElement('div');
    box.id = 'cookie-notice';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Уведомление о cookie');
    box.style.cssText = [
      'position:fixed', 'left:12px', 'right:12px', 'bottom:12px', 'z-index:2147483000',
      'max-width:600px', 'margin:0 auto', 'padding:14px 16px', 'border-radius:14px',
      'background:#16233b', 'color:#f1f4fa', 'box-shadow:0 8px 30px rgba(0,0,0,.28)',
      'font:14px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif',
      'display:flex', 'gap:12px', 'align-items:center', 'flex-wrap:wrap',
    ].join(';');

    var text = document.createElement('div');
    text.style.cssText = 'flex:1 1 260px';
    text.appendChild(document.createTextNode(METRIKA_ID
      ? 'Мы используем файлы cookie для аналитики — понять, откуда приходят посетители. '
      : 'Сайт не использует cookie для отслеживания и рекламы: только технические данные для работы сайта. '));
    var link = document.createElement('a');
    link.href = '/cookies.html';
    link.textContent = 'Подробнее';
    link.style.cssText = 'color:#9dbcf7;font-weight:700';
    text.appendChild(link);

    function button(label, primary, value) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'flex:0 0 auto;border-radius:10px;padding:9px 16px;cursor:pointer;font:700 14px -apple-system,"Segoe UI",system-ui,sans-serif;' +
        (primary ? 'border:0;background:#fff;color:#0b1220' : 'border:1px solid rgba(255,255,255,.28);background:transparent;color:#f1f4fa');
      b.addEventListener('click', function () {
        save(value);
        if (value === 'all') loadMetrika();
        if (box.parentNode) box.parentNode.removeChild(box);
      });
      return b;
    }

    var actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    if (METRIKA_ID) {
      actions.appendChild(button('Только необходимые', false, 'necessary'));
      actions.appendChild(button('Принять', true, 'all'));
    } else {
      actions.appendChild(button('Понятно', true, 'necessary'));
    }

    box.appendChild(text);
    box.appendChild(actions);
    document.body.appendChild(box);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
  else show();
})();
