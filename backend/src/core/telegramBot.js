// Бот @business_safe_bot (18.10.2026): приветствие на /start и уведомления
// сообщением тем, кто привязал Telegram (telegram_links, миграции 0141/0143).
// Только Bot API по HTTPS; без токена (TELEGRAM_BOT_TOKEN) — молча ничего.
const pool = require('../db/pool');

const API = 'https://api.telegram.org';

function siteUrl() {
  return (process.env.SITE_URL || 'https://business-safe.ru').replace(/\/$/, '');
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Кнопка, которая открывает кабинет внутри Telegram (Mini App), сразу на
// нужном экране. path — путь приложения, например '/deadlines'.
function openButton(text, path = '/') {
  const clean = String(path || '/').startsWith('/') ? path : '/';
  return { inline_keyboard: [[{ text, web_app: { url: `${siteUrl()}/lk${clean === '/' ? '/' : clean}` } }]] };
}

async function call(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, skipped: true };
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({ ok: false }));
  return { ...data, status: res.status };
}

function sendMessage(chatId, html, replyMarkup) {
  return call('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: replyMarkup });
}

// Уведомление компании в Telegram — тем же людям, что получают push:
// владелец и администраторы (налоговое — не администратору), с учётом
// тумблеров категорий в «Настройках» и личного «присылать в Telegram».
async function sendTelegramToCompany({ companyId, category, title, body, url }) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return { sent: 0 };
  if (category) {
    const { rows } = await pool.query('SELECT enabled FROM notification_settings WHERE company_id = $1 AND category = $2', [companyId, category]);
    if (rows[0]?.enabled === false) return { sent: 0, categoryDisabled: true };
  }
  const { rows: chats } = await pool.query(
    `SELECT DISTINCT t.telegram_user_id
     FROM telegram_links t
     JOIN memberships m ON m.user_id = t.user_id
     WHERE m.company_id = $1 AND m.invite_status = 'active' AND m.active = true
       AND m.role IN ('owner', 'admin') AND t.notify = true AND t.blocked_at IS NULL
       AND ($2::text IS DISTINCT FROM 'tax' OR m.role != 'admin')`,
    [companyId, category || null]
  );
  if (chats.length === 0) return { sent: 0 };

  const { rows: company } = await pool.query('SELECT name FROM companies WHERE id = $1', [companyId]);
  // Название компании — чтобы владелец нескольких точек понимал, о какой речь.
  const text = [`<b>${esc(title)}</b>`, body ? esc(body) : null, company[0]?.name ? `<i>${esc(company[0].name)}</i>` : null].filter(Boolean).join('\n');
  let sent = 0;
  for (const { telegram_user_id: chatId } of chats) {
    try {
      const r = await sendMessage(chatId, text, openButton('Открыть', url || '/'));
      if (r.ok) sent += 1;
      // 403 — бот заблокирован или человек ещё не нажимал «Старт»: не стучимся,
      // пока он не напишет боту /start (telegram-webhook.routes.js снимет отметку).
      else if (r.status === 403) await pool.query('UPDATE telegram_links SET blocked_at = now() WHERE telegram_user_id = $1', [chatId]);
    } catch (err) {
      console.error('sendTelegramToCompany failed', companyId, err.message);
    }
  }
  return { sent };
}

module.exports = { sendMessage, sendTelegramToCompany, openButton, call, siteUrl };
