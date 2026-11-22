// Лента бумаг: одна бумага через день после сферы, затем ещё две через день,
// потом раз в неделю строка с тем, что человек не закрыл.
// Сама никому не пишет, пока её не вызовет запущенный сервер.
// Напоминание о продаже (telegramSalesNudge.js) отсюда не вызывается.
require('dotenv').config();
const pool = require('../db/pool');
const { sendMessage } = require('./telegramBot');
const { PRICE } = require('./telegramDialogRules');

const LOCK = 170171;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function lowerTitle(title) {
  const text = String(title || '').trim();
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function paperText(title, mentionPrice) {
  const base = `${title}. Если это уже есть — напишите «есть», сниму с списка. Если нет, пункт останется.`;
  if (!mentionPrice) return base;
  return `${base} Открыто уже три пункта. Что сделать по каждому — ${PRICE}. Дальше буду только напоминать, что осталось открытым.`;
}

function digestText(openTitles) {
  if (!openTitles.length) return 'Все названные бумаги вы закрыли. Новые сам не присылаю.';
  const list = openTitles.map(lowerTitle).join(', ');
  return `Открыто ${openTitles.length}: ${list}.`;
}

const LAST_STOP = `
  AND NOT EXISTS (
    SELECT 1 FROM telegram_dialog_messages m
    WHERE m.telegram_user_id = d.telegram_user_id
      AND m.role = 'user'
      AND m.intent IN ('bye', 'anger')
      AND m.created_at = (
        SELECT max(created_at) FROM telegram_dialog_messages
        WHERE telegram_user_id = d.telegram_user_id AND role = 'user'
      )
  )`;

async function sendClaimed(client, row, text, intent) {
  await client.query(
    `INSERT INTO telegram_dialog_messages (telegram_user_id, role, text, intent)
     VALUES ($1, 'bot', $2, $3)`,
    [row.telegram_user_id, text, intent]
  );
  const result = await sendMessage(row.telegram_user_id, esc(text));
  if (!result?.ok && !result?.skipped) console.error('telegram feed send failed', result?.status || '');
  return !!result?.ok;
}

async function sendDuePapers(client) {
  const { rows } = await client.query(
    `UPDATE telegram_feed_items i
     SET sent_at = now()
     WHERE i.id IN (
       SELECT i2.id
       FROM telegram_feed_items i2
       JOIN telegram_dialogs d ON d.telegram_user_id = i2.telegram_user_id
       WHERE i2.sent_at IS NULL
         AND d.feed_stopped_at IS NULL
         AND i2.sort = (
           SELECT min(sort) FROM telegram_feed_items
           WHERE telegram_user_id = i2.telegram_user_id AND sent_at IS NULL
         )
         AND (
           i2.sort = 1 AND (now() AT TIME ZONE 'Europe/Moscow')::date
             > (i2.created_at AT TIME ZONE 'Europe/Moscow')::date
           OR i2.sort > 1 AND (now() AT TIME ZONE 'Europe/Moscow')::date
             >= (
               SELECT (max(sent_at) AT TIME ZONE 'Europe/Moscow')::date + 2
               FROM telegram_feed_items
               WHERE telegram_user_id = i2.telegram_user_id AND sent_at IS NOT NULL
             )
         )
         ${LAST_STOP}
       ORDER BY i2.telegram_user_id, i2.sort
       LIMIT 30
     )
     RETURNING id, telegram_user_id, title`
  );
  let sent = 0;
  for (const row of rows) {
    const { rows: open } = await client.query(
      `SELECT count(*)::int AS n FROM telegram_feed_items
       WHERE telegram_user_id = $1 AND sent_at IS NOT NULL AND closed_at IS NULL`,
      [row.telegram_user_id]
    );
    const { rows: flag } = await client.query(
      'SELECT feed_price_mentioned_at FROM telegram_dialogs WHERE telegram_user_id = $1',
      [row.telegram_user_id]
    );
    const mentionPrice = open[0].n >= 3 && !flag[0]?.feed_price_mentioned_at;
    if (mentionPrice) {
      await client.query(
        `UPDATE telegram_dialogs
         SET feed_price_mentioned_at = now(), updated_at = now()
         WHERE telegram_user_id = $1 AND feed_price_mentioned_at IS NULL`,
        [row.telegram_user_id]
      );
    }
    if (await sendClaimed(client, row, paperText(row.title, mentionPrice), 'feed_paper')) sent += 1;
  }
  return sent;
}

async function sendDueDigests(client) {
  const { rows } = await client.query(
    `UPDATE telegram_dialogs d
     SET feed_digest_at = now(), updated_at = now()
     WHERE d.telegram_user_id IN (
       SELECT d2.telegram_user_id
       FROM telegram_dialogs d2
       WHERE d2.feed_stopped_at IS NULL
         AND d2.feed_sphere IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM telegram_feed_items i
           WHERE i.telegram_user_id = d2.telegram_user_id AND i.sent_at IS NULL
         )
         AND EXISTS (
           SELECT 1 FROM telegram_feed_items i
           WHERE i.telegram_user_id = d2.telegram_user_id AND i.sent_at IS NOT NULL
         )
         AND (
           SELECT max(i.sent_at) FROM telegram_feed_items i
           WHERE i.telegram_user_id = d2.telegram_user_id
         ) <= now() - interval '7 days'
         AND (d2.feed_digest_at IS NULL OR d2.feed_digest_at <= now() - interval '7 days')
         AND NOT EXISTS (
           SELECT 1 FROM telegram_dialog_messages m
           WHERE m.telegram_user_id = d2.telegram_user_id
             AND m.role = 'user'
             AND m.intent IN ('bye', 'anger')
             AND m.created_at = (
               SELECT max(created_at) FROM telegram_dialog_messages
               WHERE telegram_user_id = d2.telegram_user_id AND role = 'user'
             )
         )
       LIMIT 30
     )
     RETURNING d.telegram_user_id`
  );
  let sent = 0;
  for (const row of rows) {
    const { rows: open } = await client.query(
      `SELECT title FROM telegram_feed_items
       WHERE telegram_user_id = $1 AND sent_at IS NOT NULL AND closed_at IS NULL
       ORDER BY sort`,
      [row.telegram_user_id]
    );
    const titles = open.map((item) => item.title);
    if (!titles.length) {
      await client.query(
        `UPDATE telegram_dialogs SET feed_stopped_at = now(), updated_at = now()
         WHERE telegram_user_id = $1`,
        [row.telegram_user_id]
      );
    }
    if (await sendClaimed(client, row, digestText(titles), 'feed_digest')) sent += 1;
  }
  return sent;
}

async function run() {
  const { rows: tables } = await pool.query(`SELECT to_regclass('public.telegram_feed_items') AS name`);
  if (!tables[0]?.name) return { sent: 0, skipped: 'no_table' };

  const client = await pool.connect();
  let locked = false;
  try {
    const lock = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK]);
    locked = !!lock.rows[0]?.ok;
    if (!locked) return { sent: 0, skipped: 'lock' };
    const papers = await sendDuePapers(client);
    const digests = await sendDueDigests(client);
    return { sent: papers + digests };
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [LOCK]).catch(() => {});
    client.release();
  }
}

if (require.main === module) {
  run()
    .then((result) => {
      console.log(JSON.stringify(result));
      return pool.end();
    })
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
      return pool.end();
    });
}

module.exports = { run, paperText, digestText };
