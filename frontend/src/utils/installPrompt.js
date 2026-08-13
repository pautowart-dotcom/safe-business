// Перехват нативного события установки PWA (Chrome/Edge/Android — Safari/iOS
// такого API не имеет вообще, там своя ручная инструкция, см. IosPushBanner).
// Слушатель вешается на уровне модуля (не внутри компонента), потому что
// beforeinstallprompt может сработать до того, как Dashboard успеет
// смонтироваться и подписаться.

let deferredPrompt = null;
let listeners = [];

function notify() {
  listeners.forEach((cb) => cb());
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  notify();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  notify();
});

export function getDeferredInstallPrompt() {
  return deferredPrompt;
}

export function onInstallPromptChange(cb) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}
