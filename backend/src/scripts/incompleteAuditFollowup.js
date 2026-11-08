// Напоминание: начали тест, не закончили (07.11.2026, 90-дневный план продаж).
// Только у кого есть реальный email и согласие на рекламную/инфо-рассылку.
// Гости без почты до оплаты сюда не попадают — им некуда писать.
// Один раз на пользователя. Вызывается из dailyOperationsNudges.js.
//
// Запуск вручную: node src/scripts/incompleteAuditFollowup.js
require('dotenv').config();
const pool = require('../db/pool');
const { sendMail } = require('../core/mailer');
const { escapeHtml, unsubscribeUrl } = require('../platform/anonymous-audit.routes');

async function run() {
  const { rows } = await pool.query(
    `SELECT DISTINCT u.id AS user_id, u.email, u.is_guest, ss.niche, ss.started_at
     FROM users u
     JOIN memberships m ON m.user_id = u.id AND m.role = 'owner'
     JOIN security_sessions ss ON ss.company_id = m.company_id AND ss.status = 'in_progress'
     WHERE u.marketing_consent_at IS NOT NULL
       AND u.incomplete_audit_followup_sent_at IS NULL
       AND u.email NOT LIKE '%@guest.business-safe.internal'
       AND ss.started_at < now() - interval '1 day'
       AND ss.started_at > now() - interval '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM security_sessions done
         WHERE done.company_id = m.company_id AND done.status = 'completed'
           AND done.started_at >= ss.started_at
       )
       AND NOT EXISTS (
         SELECT 1 FROM subscription_payments p
         WHERE p.company_id = m.company_id AND p.status = 'succeeded'
       )
       AND NOT EXISTS (
         SELECT 1 FROM addon_purchases a
         WHERE a.company_id = m.company_id AND a.status = 'succeeded'
       )`
  );

  let sent = 0;
  const base = (process.env.FRONTEND_URL || 'https://business-safe.ru').replace(/\/$/, '');

  for (const r of rows) {
    const { rowCount } = await pool.query(
      `UPDATE users SET incomplete_audit_followup_sent_at = now()
       WHERE id = $1 AND incomplete_audit_followup_sent_at IS NULL`,
      [r.user_id]
    );
    if (rowCount === 0) continue;

    const continueUrl = r.is_guest ? `${base}/audit` : `${base}/`;
    const niche = r.niche ? escapeHtml(String(r.niche)) : 'вашей нише';

    await sendMail({
      to: r.email,
      subject: 'Тест можно добить за несколько минут',
      html:
        `<p>Здравствуйте! Вы начинали бесплатный тест по ${niche} в «Безопасный бизнес» и не закончили.</p>` +
        `<p>Обычно как раз в середине становится понятно, какие пункты «висят». Добейте тест — в конце будет список, с чего начать, без обязательств платить.</p>` +
        `<p><a href="${continueUrl}">Продолжить тест</a></p>` +
        `<p style="color:#888;font-size:12px">Вы получили это письмо, потому что согласились получать сообщения от «Безопасный бизнес». ` +
        `Не хотите больше — <a href="${unsubscribeUrl(r.user_id)}">отписаться</a>.</p>`,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl(r.user_id)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      meta: { purpose: 'incomplete_audit_followup' },
    });
    sent++;
  }
  return sent;
}

module.exports = { run };

if (require.main === module) {
  run()
    .then((n) => { console.log(`incompleteAuditFollowup: отправлено ${n}`); return pool.end(); })
    .catch((err) => { console.error('incompleteAuditFollowup упал:', err); pool.end().finally(() => process.exit(1)); });
}
