// Письмо-напоминание после теста (25.10.2026, решение владельца по совету
// таргетолога, миграция 0158). Один раз, через 2–7 дней после того, как
// человек оставил почту перед результатом теста, — только тем, кто:
// - отметил согласие на информационные и рекламные письма (marketing_consent_at,
//   ст. 18 закона № 38-ФЗ «О рекламе»);
// - ничего не купил (ни заключения, ни документов, ни подписки).
// Отдельной строки cron нет: вызывается из ежедневного dailyOperationsNudges.js
// (09:00 МСК), чтобы владельцу не править crontab на сервере.
//
// Запуск вручную: node src/scripts/guestResultFollowup.js
require('dotenv').config();
const crypto = require('crypto');
const pool = require('../db/pool');
const { sendMail } = require('../core/mailer');
const { guestResultSummary, escapeHtml, CLAIM_TOKEN_TTL_DAYS } = require('../platform/anonymous-audit.routes');

const REPORT_PRICE_RUB = 1990;

function points(n) {
  const m10 = n % 10; const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} пункт`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} пункта`;
  return `${n} пунктов`;
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
      subject: `По тесту — ${points(summary.titles.length)}: с чего начать`,
      html:
        `<p>Здравствуйте! Несколько дней назад вы проходили тест в «Безопасный бизнес». Напоминаем, что стоит закрыть в первую очередь:</p>` +
        summary.top.map((v) => `<p><b>${escapeHtml(v.title)}</b><br>Штраф: ${escapeHtml(v.fine)}<br>Что сделать: ${escapeHtml(v.whatToDo)}</p>`).join('') +
        `<p>Всего по тесту — ${summary.titles.length}. По каждому пункту штраф, норма закона, план по шагам и инструкции — ` +
        `в заключении за ${REPORT_PRICE_RUB.toLocaleString('ru-RU')} ₽, разово, без подписки. ` +
        `Если нужны и готовые документы с вашими данными — в кабинете есть набор «заключение + документы».</p>` +
        `<p><a href="${enterUrl}">Войти в кабинет</a> — результат теста уже там, проходить заново не нужно.</p>` +
        `<p style="color:#888;font-size:12px">Вы получили это письмо, потому что согласились получать сообщения от «Безопасный бизнес». ` +
        `Не хотите больше — просто ответьте на это письмо, и мы перестанем писать.</p>`,
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
