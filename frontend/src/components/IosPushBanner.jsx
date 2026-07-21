import { useState } from 'react';
import { isIos, isStandalone } from '../utils/push.js';
import { C } from '../ui/components.jsx';

const DISMISS_KEY = 'iosHomeScreenBannerDismissed';

// Пакет 3, Этап 9: на iOS push работает только после установки на "Домашний
// экран" — ненавязчивый баннер на главной подсказывает это при первом входе.
// Хранится в localStorage (не в БД — чисто подсказка для этого устройства/
// браузера, не состояние аккаунта).
export default function IosPushBanner() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');

  if (dismissed || !isIos() || isStandalone()) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <div style={{ fontSize: 12, color: C.secondary, lineHeight: 1.5, flex: 1 }}>
        Чтобы получать push-уведомления на iPhone/iPad — добавьте сайт на "Домашний экран" (Поделиться → На экран «Домой»).
      </div>
      <button onClick={dismiss} style={{ background: 'none', border: 'none', color: C.subtle, fontSize: 16, cursor: 'pointer', padding: 0, lineHeight: 1 }} aria-label="Скрыть">×</button>
    </div>
  );
}
