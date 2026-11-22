// Входящие сообщения боту @bezbizru_bot. Telegram шлёт
// сюда обновления (webhook ставит scripts/telegramSetup.js). Проверяем
// секрет из заголовка X-Telegram-Bot-Api-Secret-Token — без него любой мог бы
// слать сюда поддельные «сообщения». Без TELEGRAM_WEBHOOK_SECRET — 404.
const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { handleIncoming } = require('../core/telegramDialog');

const router = express.Router();

function secretOk(req) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  const got = req.get('x-telegram-bot-api-secret-token') || '';
  if (!expected || got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!secretOk(req)) return res.status(404).json({ error: 'not_found' });
    // Telegram ждёт быстрый 200, иначе повторяет — отвечаем сразу, работу делаем после.
    res.json({ ok: true });

    const msg = req.body?.message;
    const chatId = msg?.chat?.id;
    const fromId = msg?.from?.id;
    if (!chatId || msg.chat.type !== 'private' || !Number.isSafeInteger(fromId)) return;
    const text = typeof msg.text === 'string' ? msg.text.trim() : '';

    try {
      // Человек написал боту — значит, писать ему снова можно.
      await pool.query('UPDATE telegram_links SET blocked_at = NULL WHERE telegram_user_id = $1', [fromId]);
      await handleIncoming({ fromId, chatId, text });
    } catch (err) {
      console.error('telegram webhook reply failed', err.message);
    }
  })
);

module.exports = router;
