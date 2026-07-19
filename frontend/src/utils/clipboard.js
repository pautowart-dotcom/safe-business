// navigator.clipboard требует secure context (https или localhost) — сайт
// пока обслуживается по http (см. deploy/nginx.conf, IP без домена и TLS),
// поэтому в мобильных браузерах navigator.clipboard там undefined и
// раньше кнопка "Скопировать" молча ничего не делала. Фолбэк —
// document.execCommand('copy') через скрытый textarea, он работает и без
// secure context.
export async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // падает в фолбэк ниже
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}
