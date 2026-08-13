import { useEffect, useState } from 'react';
import { getDeferredInstallPrompt, onInstallPromptChange } from '../utils/installPrompt.js';
import { isStandalone } from '../utils/push.js';
import { C } from '../ui/components.jsx';

const DISMISS_KEY = 'installAppBannerDismissed';

// Chrome/Android/десктоп умеют сами предложить установку на "Домашний
// экран" (иконка в адресной строке), но многие её просто не замечают —
// явный баннер на главной. Отдельно от IosPushBanner: там своя ручная
// инструкция, потому что у Safari/iOS этого API нет вообще, здесь —
// настоящий системный диалог установки в один клик.
// Закрытие запоминается в localStorage (не в БД — подсказка для этого
// устройства/браузера, не состояние аккаунта), как и у iOS-баннера.
export default function InstallAppBanner() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  const [available, setAvailable] = useState(() => !!getDeferredInstallPrompt());

  useEffect(() => onInstallPromptChange(() => setAvailable(!!getDeferredInstallPrompt())), []);

  if (dismissed || !available || isStandalone()) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  async function install() {
    const prompt = getDeferredInstallPrompt();
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    dismiss();
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 12, color: C.secondary, lineHeight: 1.5, flex: 1 }}>
        Можно установить приложение на телефон — иконка на экране «Домой», без браузера.
      </div>
      <button
        onClick={install}
        style={{ background: C.primary, color: '#FFF', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        Установить
      </button>
      <button onClick={dismiss} style={{ background: 'none', border: 'none', color: C.subtle, fontSize: 16, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }} aria-label="Скрыть">×</button>
    </div>
  );
}
