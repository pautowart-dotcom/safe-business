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

// Подписка на push живёт на уровне браузера/origin, а не компании — один и
// тот же endpoint используется для всех компаний, в которых состоит
// владелец (миграция 0119, у самого владельца их две). Поэтому "включено"
// для ТЕКУЩЕЙ компании — это не факт существования браузерной подписки, а
// то, есть ли для этого endpoint строка на сервере именно в этой компании.
export async function getPushSubscriptionState() {
  if (!isPushSupported()) return 'unsupported';
  const registration = await navigator.serviceWorker.ready;
  const sub = await registration.pushManager.getSubscription();
  if (!sub) return 'unsubscribed';
  const { data } = await api.get('/platform/push/subscribe/status', { params: { endpoint: sub.endpoint } });
  return data.subscribed ? 'subscribed' : 'unsubscribed';
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

// Намеренно НЕ вызывает subscription.unsubscribe() — это уничтожило бы
// браузерную push-регистрацию целиком (она одна на origin, общая для всех
// компаний владельца), и вторая компания в том же браузере молча перестала
// бы получать push. "Выключить" для одной компании — значит удалить только
// её строку на сервере; сама браузерная подписка остаётся живой для других
// компаний, которым принадлежит этот же endpoint.
export async function unsubscribeFromPush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await api.delete('/platform/push/subscribe', { data: { endpoint: subscription.endpoint } });
}
