// Автообновление для standalone/PWA (iOS "на Домой"), которое не всегда
// перечитывает index.html при обычном открытии — см. deploy/nginx.conf,
// комментарий у location = /lk/index.html. version.json собирается в тот же
// момент, что и бандл (vite.config.js), так что расхождение с __APP_BUILD_ID__,
// вшитым в уже загруженный код, значит: на сервере вышла новая версия.
export function startVersionCheck() {
  const check = async () => {
    try {
      const res = await fetch('/lk/version.json', { cache: 'no-store' });
      const { buildId } = await res.json();
      if (buildId && buildId !== __APP_BUILD_ID__) {
        window.location.reload();
      }
    } catch {
      // Нет сети или файла ещё нет — просто пробуем в следующий раз.
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('focus', check);
}
