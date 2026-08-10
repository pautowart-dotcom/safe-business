// Продукт "roadmap открытия бизнеса" — через CHECKIN_DELAY_DAYS после оплаты
// шлём письмо-чекин "как продвигается открытие" с двумя ссылками
// (GET /api/platform/roadmap/checkin/:token?status=...). Клик "уже открылся"
// сразу шлёт апсейл на подписку — это делает сам roadmap.routes.js
// синхронно по клику, здесь только сам чекин.
//
// Запускается по системному cron на сервере, не самошедулится внутри
// процесса — тот же паттерн, что retentionCleanup.js/chargeRecurringSubscriptions.js.
// Установка cron — deploy/provision.sh.
//
// Запуск вручную: node src/scripts/roadmapCheckin.js
require('dotenv').config();
const pool = require('../db/pool');
const { sendMail } = require('../core/mailer');

const CHECKIN_DELAY_DAYS = 21; // легко поменять; "через несколько недель" из ТЗ

function siteUrl() {
  return process.env.SITE_URL || 'https://business-safe.ru';
}

async function run() {
  const { rows } = await pool.query(
    `SELECT ro.id, ro.access_token, l.email
     FROM roadmap_orders ro JOIN leads l ON l.id = ro.lead_id
     WHERE ro.status = 'succeeded'
       AND ro.checkin_sent_at IS NULL
       AND ro.confirmed_at < now() - interval '${CHECKIN_DELAY_DAYS} days'`
  );

  for (const order of rows) {
    const base = `${siteUrl()}/api/platform/roadmap/checkin/${order.access_token}`;
    try {
      await sendMail({
        to: order.email,
        subject: 'Как продвигается открытие? — «Безопасный бизнес»',
        html: `<p>Прошло ${CHECKIN_DELAY_DAYS} дней с покупки roadmap — как дела с открытием?</p>
               <p><a href="${base}?status=already_open">Уже открылся(-ась)</a> · <a href="${base}?status=not_yet">Ещё нет</a></p>`,
      });
      await pool.query('UPDATE roadmap_orders SET checkin_sent_at = now() WHERE id = $1', [order.id]);
    } catch (err) {
      console.error(`roadmapCheckin: не удалось отправить письмо для заказа ${order.id}:`, err.message);
    }
  }

  console.log(`Чекин-письма: отправлено ${rows.length}.`);
}

run()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Ошибка чекина roadmap:', err);
    pool.end().finally(() => process.exit(1));
  });
