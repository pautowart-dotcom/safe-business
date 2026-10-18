// Разовая настройка бота (18.10.2026) — запускает владелец на сервере:
//   cd /var/www/safe-business/backend && node src/scripts/telegramSetup.js
// Говорит Telegram, куда слать сообщения боту (webhook с секретом), и
// задаёт команды. Нужны TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET в .env.
require('dotenv').config();
const { call, siteUrl } = require('../core/telegramBot');

async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error('Нет TELEGRAM_BOT_TOKEN в .env');
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !/^[A-Za-z0-9_-]{16,256}$/.test(secret)) {
    throw new Error('Нет TELEGRAM_WEBHOOK_SECRET в .env (16+ символов: латиница, цифры, _ и -). Сгенерировать: node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'hex\'))"');
  }
  const url = `${siteUrl()}/api/platform/telegram-webhook`;

  const hook = await call('setWebhook', { url, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true });
  console.log('setWebhook:', hook.ok ? `ок → ${url}` : hook);

  const cmds = await call('setMyCommands', { commands: [{ command: 'start', description: 'Открыть кабинет' }] });
  console.log('setMyCommands:', cmds.ok ? 'ок' : cmds);

  const info = await call('getWebhookInfo', {});
  console.log('getWebhookInfo:', info.ok ? { url: info.result.url, pending: info.result.pending_update_count, lastError: info.result.last_error_message || 'нет' } : info);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
