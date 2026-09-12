require('dotenv').config();
const pool = require('../db/pool');
const { sendMail } = require('../core/mailer');

// Ежедневный дайджест по платежам (27.08.2026, Карта фронтов P0) — прямой
// ответ на реальный инцидент: кнопка оплаты на мобильном была технически на
// экране, но недостижима в реальном вьюпорте, и это никто не заметил
// несколько дней подряд, пока не разобрали воронку вручную. Цель — не дать
// такому повториться молча: сколько попыток оплаты было за сутки, сколько
// прошло успешно, и отдельно — платежи, зависшие в 'pending' дольше 2 часов
// (обычно значит: вебхук ЮKassa не дошёл или упал на нашей стороне).
//
// Источники платежей (см. миграции 0044/0075/0090/0070/0091) — не общий SQL
// со всеми, а отдельный запрос на каждый, потому что схемы не совпадают
// (addon_purchases без is_recurring_charge, roadmap_orders вообще про
// анонимных leads, не про companies).
//
// ИСПРАВЛЕНО 12.09.2026 — реальный баг, замеченный владельцем: запрос по
// subscription_payments не отличал report_id IS NULL (настоящая подписка) от
// report_id IS NOT NULL (разовая покупка отчёта, см. 0091_one_time_report_
// unlock.sql) — обе группы считались и подписывались как «Подписка на
// платформу». Два человека, оплативших отчёт разово, в дайджесте выглядели
// как 2 успешные подписки, которых не было. roadmap_orders вообще не входил
// в SOURCES — платежи за roadmap были не перепутаны, а просто невидимы в
// этом отчёте. ownerField — колонка для показа владельца платежа в списке
// зависших (у roadmap_orders это lead_id, не company_id).
const SOURCES = [
  { table: 'subscription_payments', label: 'Подписка на платформу', extraWhere: 'report_id IS NULL', ownerField: 'company_id', ownerLabel: 'компания' },
  { table: 'subscription_payments', label: 'Разовая покупка отчёта', extraWhere: 'report_id IS NOT NULL', ownerField: 'company_id', ownerLabel: 'компания' },
  { table: 'addon_purchases', label: 'Разовые надстройки', ownerField: 'company_id', ownerLabel: 'компания' },
  { table: 'roadmap_orders', label: 'Roadmap открытия бизнеса', ownerField: 'lead_id', ownerLabel: 'лид' },
  { table: 'ai_advisor_subscription_payments', label: 'ИИ-советник', ownerField: 'company_id', ownerLabel: 'компания' },
];

async function summarizeSource({ table, extraWhere, ownerField, ownerLabel }) {
  const where = extraWhere ? `WHERE ${extraWhere} AND created_at >= now() - interval '24 hours'` : `WHERE created_at >= now() - interval '24 hours'`;
  const { rows: statusRows } = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM ${table}
     ${where}
     GROUP BY status`
  );
  const byStatus = { pending: 0, succeeded: 0, canceled: 0 };
  for (const row of statusRows) byStatus[row.status] = row.count;

  const stuckWhere = extraWhere
    ? `WHERE ${extraWhere} AND status = 'pending' AND created_at < now() - interval '2 hours'`
    : `WHERE status = 'pending' AND created_at < now() - interval '2 hours'`;
  const { rows: stuckRows } = await pool.query(
    `SELECT id, ${ownerField} AS owner_id, amount_rub, created_at
     FROM ${table}
     ${stuckWhere}
     ORDER BY created_at ASC`
  );

  return { byStatus, stuck: stuckRows, ownerLabel };
}

function formatSection(label, { byStatus, stuck, ownerLabel }) {
  const total = byStatus.pending + byStatus.succeeded + byStatus.canceled;
  let html = `<h3>${label}</h3>`;
  html += `<p>За 24 часа: ${total} попыт${total === 1 ? 'ка' : total < 5 ? 'ки' : 'ок'} — успешно ${byStatus.succeeded}, отменено ${byStatus.canceled}, в процессе ${byStatus.pending}.</p>`;
  if (stuck.length > 0) {
    html += `<p style="color:#c0392b;"><b>Зависли в pending дольше 2 часов (${stuck.length}):</b></p><ul>`;
    for (const row of stuck) {
      html += `<li>id ${row.id}, ${ownerLabel} ${row.owner_id}, ${row.amount_rub} ₽, создан ${row.created_at.toISOString()}</li>`;
    }
    html += '</ul>';
  }
  return html;
}

async function run() {
  const sections = [];
  let totalStuck = 0;
  for (const source of SOURCES) {
    const summary = await summarizeSource(source);
    sections.push(formatSection(source.label, summary));
    totalStuck += summary.stuck.length;
  }

  const ownerEmail = process.env.SEED_OWNER_EMAIL;
  if (!ownerEmail) {
    console.error('SEED_OWNER_EMAIL не задан в .env — некому отправить дайджест платежей');
    return;
  }

  const subjectPrefix = totalStuck > 0 ? `⚠️ ${totalStuck} зависших платежей — ` : '';
  await sendMail({
    to: ownerEmail,
    subject: `${subjectPrefix}Дайджест платежей за сутки`,
    html: sections.join('<hr>'),
  });
  console.log(`Дайджест платежей отправлен на ${ownerEmail}, зависших: ${totalStuck}`);
}

run()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Ошибка мониторинга платежей:', err);
    pool.end().finally(() => process.exit(1));
  });
