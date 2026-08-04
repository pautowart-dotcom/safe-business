// Push-уведомления (Пакет 3, Этап 9): Web Push API, без внешнего
// брокера — библиотека web-push шлёт запрос напрямую в push-службу
// браузера (FCM/Mozilla push service/Apple Web Push), используя пару
// VAPID-ключей для подписи. Без ключей в окружении (VAPID_PUBLIC_KEY/
// VAPID_PRIVATE_KEY) модуль тихо ничего не отправляет — чтобы деплой без
// настроенного push не падал и не логировал шум на каждое событие.
const pool = require('../db/pool');
const webpush = require('web-push');

const configured = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (configured) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:support@safe-business.local',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// category — если задана, проверяем notification_settings (тумблеры
// Этапа 2) и молча ничего не шлём при выключенной категории. Налоговые
// (category='tax') дополнительно не уходят на подписки Администратора —
// та же политика видимости, что и у самих дедлайнов (Этап 4,
// platform/deadlines.routes.js).
// onlyMembershipId — используется кнопкой "Отправить тестовое" в
// Настройках: шлём только на устройства самого тестирующего, не на все
// подписки компании, чтобы проверка не спамила коллег.
// Возвращает сводку по попытке отправки — раньше ошибки (кроме 404/410)
// проглатывались молча, и "Отправить тестовое" в Настройках всегда отвечал
// "успех", даже если push реально не дошёл (например VAPID-ключи сервера
// поменялись, а браузер ещё подписан на старые — типичная причина после
// того как ключи сгенерировали заново). Вызывающий код (push.routes.js
// /test) использует это, чтобы показать владельцу реальную причину, а не
// врать про успех; остальные вызовы (уведомления по дедлайнам и т.п.)
// результат по-прежнему не проверяют — это fire-and-forget, как и было.
async function sendPushToCompany({ companyId, category, title, body, url, onlyMembershipId = null }) {
  if (!configured) return { configured: false, sent: 0, failed: 0, subscriptions: 0, errors: [] };

  if (category) {
    const { rows } = await pool.query(
      'SELECT enabled FROM notification_settings WHERE company_id = $1 AND category = $2',
      [companyId, category]
    );
    if (rows[0]?.enabled === false) return { configured: true, sent: 0, failed: 0, subscriptions: 0, errors: [], categoryDisabled: true };
  }

  const { rows: subs } = await pool.query(
    `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
     FROM push_subscriptions ps
     JOIN memberships m ON m.id = ps.membership_id
     WHERE ps.company_id = $1
       AND ($2::text IS DISTINCT FROM 'tax' OR m.role != 'admin')
       AND ($3::int IS NULL OR ps.membership_id = $3)`,
    [companyId, category || null, onlyMembershipId]
  );
  if (subs.length === 0) return { configured: true, sent: 0, failed: 0, subscriptions: 0, errors: [] };

  const payload = JSON.stringify({ title, body, url: url || '/' });
  let sent = 0;
  const errors = [];
  await Promise.all(
    subs.map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
        .then(() => {
          sent += 1;
        })
        .catch(async (err) => {
          // 404/410 — подписка больше не валидна (юзер отписался/сбросил
          // разрешения/переустановил браузер) — чистим, иначе будем биться
          // об неё при каждой отправке.
          if (err.statusCode === 404 || err.statusCode === 410) {
            await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);
          }
          errors.push({ statusCode: err.statusCode, message: err.body || err.message });
        })
    )
  );
  return { configured: true, sent, failed: errors.length, subscriptions: subs.length, errors };
}

module.exports = { sendPushToCompany, isPushConfigured: () => configured };
