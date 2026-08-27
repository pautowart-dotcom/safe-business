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
// Три независимых таблицы платежей (см. миграции 0044/0075/0090) — не общий
// SQL со всеми тремя, а отдельный запрос на каждую, потому что схемы почти,
// но не полностью совпадают (addon_purchases без is_recurring_charge).

const SOURCES = [
  { table: 'subscription_payments', label: 'Подписка на платформу' },
  { table: 'addon_purchases', label: 'Разовые надстройки' },
  { table: 'ai_advisor_subscription_payments', label: 'ИИ-советник' },
];

async function summarizeSource(table) {
  const { rows: statusRows } = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM ${table}
     WHERE created_at >= now() - interval '24 hours'
     GROUP BY status`
  );
  const byStatus = { pending: 0, succeeded: 0, canceled: 0 };
  for (const row of statusRows) byStatus[row.status] = row.count;

  const { rows: stuckRows } = await pool.query(
    `SELECT id, company_id, amount_rub, created_at
     FROM ${table}
     WHERE status = 'pending' AND created_at < now() - interval '2 hours'
     ORDER BY created_at ASC`
  );

  return { byStatus, stuck: stuckRows };
}

function formatSection(label, { byStatus, stuck }) {
  const total = byStatus.pending + byStatus.succeeded + byStatus.canceled;
  let html = `<h3>${label}</h3>`;
  html += `<p>За 24 часа: ${total} попыт${total === 1 ? 'ка' : total < 5 ? 'ки' : 'ок'} — успешно ${byStatus.succeeded}, отменено ${byStatus.canceled}, в процессе ${byStatus.pending}.</p>`;
  if (stuck.length > 0) {
    html += `<p style="color:#c0392b;"><b>Зависли в pending дольше 2 часов (${stuck.length}):</b></p><ul>`;
    for (const row of stuck) {
      html += `<li>id ${row.id}, компания ${row.company_id}, ${row.amount_rub} ₽, создан ${row.created_at.toISOString()}</li>`;
    }
    html += '</ul>';
  }
  return html;
}

async function run() {
  const sections = [];
  let totalStuck = 0;
  for (const source of SOURCES) {
    const summary = await summarizeSource(source.table);
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
