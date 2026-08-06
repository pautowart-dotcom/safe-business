// Service Worker для админки — тот же минимальный паттерн, что у клиентского
// ЛК (frontend/public/sw.js): ничего не кэширует, только даёт установить
// приложение на экран и (позже) принимать Web Push.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'Безопасный бизнес — Админка', body: '', url: '/office/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // не JSON — оставляем дефолт
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/office/icons/icon-192.png',
      badge: '/office/icons/icon-192.png',
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/office/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
