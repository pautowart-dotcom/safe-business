// Уведомление об использовании cookie и технических данных (20.09.2026).
// Лендинг сам cookie не устанавливает и сторонней аналитики не подключает —
// уведомление информационное, одной кнопкой "Понятно"; полный текст на
// /cookies.html. Признак "закрыто" хранится в localStorage под ключом
// cookie_notice_ok (это описано в политике). Если когда-нибудь появятся
// аналитика или реклама с cookie — здесь нужен выбор "принять/отклонить" и
// загрузка скриптов только после согласия, а не эта версия.
(function () {
  var KEY = 'cookie_notice_ok';
  try {
    if (window.localStorage.getItem(KEY) === '1') return;
  } catch (e) {
    // localStorage может быть недоступен (приватный режим) — тогда просто
    // показываем уведомление на каждой странице, не ломаем сайт.
  }

  function show() {
    if (document.getElementById('cookie-notice')) return;
    var box = document.createElement('div');
    box.id = 'cookie-notice';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Уведомление о cookie');
    box.style.cssText = [
      'position:fixed', 'left:12px', 'right:12px', 'bottom:12px', 'z-index:2147483000',
      'max-width:560px', 'margin:0 auto', 'padding:14px 16px', 'border-radius:14px',
      'background:#1d1d24', 'color:#f1f4fa', 'box-shadow:0 8px 30px rgba(0,0,0,.28)',
      'font:14px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif',
      'display:flex', 'gap:12px', 'align-items:center', 'flex-wrap:wrap',
    ].join(';');

    var text = document.createElement('div');
    text.style.cssText = 'flex:1 1 240px';
    text.appendChild(document.createTextNode('Сайт не использует cookie для отслеживания и рекламы: только технические данные для работы сайта. '));
    var link = document.createElement('a');
    link.href = '/cookies.html';
    link.textContent = 'Подробнее';
    link.style.cssText = 'color:#b7b1ff;font-weight:700';
    text.appendChild(link);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Понятно';
    btn.style.cssText = 'flex:0 0 auto;border:0;border-radius:10px;padding:9px 18px;background:#2563eb;color:#fff;font:700 14px -apple-system,"Segoe UI",system-ui,sans-serif;cursor:pointer';
    btn.addEventListener('click', function () {
      try { window.localStorage.setItem(KEY, '1'); } catch (e) {}
      if (box.parentNode) box.parentNode.removeChild(box);
    });

    box.appendChild(text);
    box.appendChild(btn);
    document.body.appendChild(box);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
  else show();
})();
