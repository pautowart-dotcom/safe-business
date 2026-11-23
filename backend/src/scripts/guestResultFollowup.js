// Письмо-напоминание после теста (25.10.2026, решение владельца по совету
// таргетолога, миграция 0158). Один раз, через 2–7 дней после того, как
// человек оставил почту перед результатом теста, — только тем, кто:
// - отметил согласие на информационные и рекламные письма (marketing_consent_at,
//   ст. 18 закона № 38-ФЗ «О рекламе»);
// - ничего не купил (ни заключения, ни документов, ни подписки).
// Отдельной строки cron нет: вызывается из ежедневного dailyOperationsNudges.js
// (09:00 МСК), чтобы владельцу не править crontab на сервере.
//
// Текст письма (23.11.2026, решение владельца): не повторять список пунктов.
// Продажа заключения и документов, без подписки и без слова «студия».
// Цены — из core/addons.js, не из текста.
//
// Запуск вручную: node src/scripts/guestResultFollowup.js
require('dotenv').config();
const crypto = require('crypto');
const pool = require('../db/pool');
const { sendMail } = require('../core/mailer');
const { getAddon, REPORT_BUNDLE_PRICE_RUB } = require('../core/addons');
const { guestResultSummary, CLAIM_TOKEN_TTL_DAYS, unsubscribeUrl } = require('../platform/anonymous-audit.routes');

const REPORT_PRICE_RUB = 1990;
const DOCS_PRICE_RUB = getAddon('document_templates').priceRub;

function rub(n) {
  return `${n.toLocaleString('ru-RU')} ₽`;
}

async function run() {
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.email, u.is_guest, m.company_id
     FROM users u
     JOIN memberships m ON m.user_id = u.id AND m.role = 'owner'
     WHERE u.marketing_consent_at IS NOT NULL
       AND u.result_followup_sent_at IS NULL
       AND u.accepted_terms_at < now() - interval '2 days'
       AND u.accepted_terms_at > now() - interval '7 days'
       AND u.email NOT LIKE '%@guest.business-safe.internal'
       -- Поставил пароль = пробный месяц, заключение уже открыто в кабинете —
       -- предлагать его купить незачем (проверка 27.10.2026).
       AND u.is_guest = true
       AND NOT EXISTS (SELECT 1 FROM subscription_payments p WHERE p.company_id = m.company_id AND p.status = 'succeeded')
       AND NOT EXISTS (SELECT 1 FROM addon_purchases a WHERE a.company_id = m.company_id AND a.status = 'succeeded')`
  );

  let sent = 0;
  for (const r of rows) {
    // Отмечаем до отправки: если письмо упадёт, повторно в следующий запуск
    // не полезем — одно напоминание, не больше.
    const { rowCount } = await pool.query(
      'UPDATE users SET result_followup_sent_at = now() WHERE id = $1 AND result_followup_sent_at IS NULL',
      [r.user_id]
    );
    if (rowCount === 0) continue;

    const summary = await guestResultSummary(r.company_id);
    if (summary.titles.length === 0) continue;

    let enterUrl = `${process.env.FRONTEND_URL}/login`;
    if (r.is_guest) {
      const token = crypto.randomBytes(32).toString('hex');
      await pool.query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [r.user_id, crypto.createHash('sha256').update(token).digest('hex'), new Date(Date.now() + CLAIM_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)]
      );
      enterUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;
    }

    await sendMail({
      to: r.email,
      subject: `Заключение по пунктам теста — ${rub(REPORT_PRICE_RUB)}`,
      html:
        `<p>Здравствуйте. В прошлом письме были названия пунктов. В заключении по каждому из них написано, что сделать, в каком порядке и на какую норму опереться. Это PDF на вашу почту.</p>` +
        `<p>${rub(REPORT_PRICE_RUB)}, один раз.</p>` +
        `<p>Если нужны и документы под ваши данные — ${rub(DOCS_PRICE_RUB)}. Вместе с заключением — ${rub(REPORT_BUNDLE_PRICE_RUB)}.</p>` +
        `<p>Оформить заключение можно <a href="${enterUrl}">по ссылке</a>. Тест заново проходить не нужно.</p>` +
        `<p style="color:#888;font-size:12px">Вы получили это письмо, потому что согласились получать сообщения от «Безопасный бизнес». ` +
        `Не хотите больше — <a href="${unsubscribeUrl(r.user_id)}">отписаться</a> (одно нажатие) или просто ответьте на это письмо.</p>`,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl(r.user_id)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      meta: { purpose: 'guest_result_followup' },
    });
    sent++;
  }
  return sent;
}

module.exports = { run };

if (require.main === module) {
  run()
    .then((n) => { console.log(`guestResultFollowup: отправлено ${n}`); return pool.end(); })
    .catch((err) => { console.error('guestResultFollowup упал:', err); pool.end().finally(() => process.exit(1)); });
}
