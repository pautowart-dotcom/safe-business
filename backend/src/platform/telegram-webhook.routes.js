// Входящие сообщения боту @business_safe_bot (18.10.2026). Telegram шлёт
// сюда обновления (webhook ставит scripts/telegramSetup.js). Проверяем
// секрет из заголовка X-Telegram-Bot-Api-Secret-Token — без него любой мог бы
// слать сюда поддельные «сообщения». Без TELEGRAM_WEBHOOK_SECRET — 404.
const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { sendMessage, openButton } = require('../core/telegramBot');

const router = express.Router();

function secretOk(req) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  const got = req.get('x-telegram-bot-api-secret-token') || '';
  if (!expected || got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

const WELCOME =
  '<b>Безопасный бизнес</b>\n\n' +
  'Помогаем не пропустить сроки по документам, санитарии и проверкам и всегда знать, что нужно оформить.\n\n' +
  '• Тест по вашей нише — около 10 минут, бесплатно\n' +
  '• Ваши сроки и напоминания — сюда, в этот чат\n\n' +
  'Нажмите кнопку ниже. Если уже пользуетесь сервисом — войдите один раз, дальше кабинет будет открываться сразу.';

const HELP =
  'Кабинет открывается кнопкой ниже или кнопкой «Открыть кабинет» слева от поля ввода.\n\n' +
  'Напоминания о сроках приходят сюда, если вы вошли в кабинет из этого чата. Выключить — в кабинете: «Настройки» → «Вход через Telegram».\n\n' +
  'Вопрос по сервису — напишите в поддержку внутри кабинета («Ещё» → «Поддержка»).';

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
      if (text.startsWith('/start')) {
        // Человек написал боту — значит, писать ему снова можно.
        await pool.query('UPDATE telegram_links SET blocked_at = NULL WHERE telegram_user_id = $1', [fromId]);
        await sendMessage(chatId, WELCOME, openButton('Открыть кабинет', '/'));
      } else {
        await sendMessage(chatId, HELP, openButton('Открыть кабинет', '/'));
      }
    } catch (err) {
      console.error('telegram webhook reply failed', err.message);
    }
  })
);

module.exports = router;
