const CODE_KEY = 'bb_partner_code';
const VISITOR_KEY = 'bb_partner_visitor';
const CODE_RE = /^[\p{L}\p{N}_-]{3,32}$/u;

export function partnerCodeForCheckout() {
  try {
    const code = localStorage.getItem(CODE_KEY);
    return code && CODE_RE.test(code) ? code : null;
  } catch {
    return null;
  }
}

function visitorKey() {
  try {
    let key = localStorage.getItem(VISITOR_KEY);
    if (!key || !/^[a-zA-Z0-9]{8,64}$/.test(key)) {
      key = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
      localStorage.setItem(VISITOR_KEY, key);
    }
    return key;
  } catch {
    return null;
  }
}

// ?ref= на любой странице кабинета запоминается до оплаты. Визит считается
// один раз на браузер. Тот же ключ пишет лендинг (landing/index.html).
export function capturePartnerRef() {
  let code = null;
  try {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && CODE_RE.test(ref.trim())) {
      code = ref.trim().toUpperCase();
      localStorage.setItem(CODE_KEY, code);
    }
  } catch {
    return;
  }
  if (!code) return;
  const key = visitorKey();
  if (!key) return;
  fetch('/api/platform/partner/visit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, visitorKey: key }),
    keepalive: true,
  }).catch(() => {});
}
