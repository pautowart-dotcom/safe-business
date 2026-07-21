import api from '../api/client.js';

// Web Push подписка (Пакет 3, Этап 9). applicationServerKey должен быть
// Uint8Array, а сервер отдаёт VAPID-ключ base64url-строкой — стандартная
// конвертация (нет built-in API для этого).
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// iOS: push работает только когда сайт установлен на "Домашний экран"
// (стоит в standalone-режиме) — обычный Safari-таб не может подписаться.
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export async function getPushSubscriptionState() {
  if (!isPushSupported()) return 'unsupported';
  const registration = await navigator.serviceWorker.ready;
  const sub = await registration.pushManager.getSubscription();
  return sub ? 'subscribed' : 'unsubscribed';
}

export async function subscribeToPush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Разрешение на уведомления не выдано');
  }

  const { data } = await api.get('/platform/push/vapid-public-key');
  if (!data.publicKey) {
    throw new Error('Push не настроен на сервере');
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey),
  });

  const json = subscription.toJSON();
  await api.post('/platform/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
  return subscription;
}

export async function unsubscribeFromPush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await api.delete('/platform/push/subscribe', { data: { endpoint: subscription.endpoint } });
  await subscription.unsubscribe();
}
