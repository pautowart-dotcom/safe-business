require('dotenv').config();
const buildApp = require('./app');
const { syncModulesTable } = require('./core/modules-registry');

async function start() {
  await syncModulesTable();
  const app = buildApp();
  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    console.log(`Платформа «Безопасный бизнес» запущена на порту ${port}`);
    startTelegramFeed();
  });
}

function startTelegramFeed() {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  const { run } = require('./core/telegramFeed');
  const tick = () => {
    run()
      .then((result) => {
        if (result?.sent) console.log('telegram feed sent', result.sent);
      })
      .catch((err) => console.error('telegram feed', err.message));
  };
  setTimeout(tick, 15000);
  setInterval(tick, 60 * 60 * 1000);
}

start().catch((err) => {
  console.error('Не удалось запустить сервер:', err);
  process.exit(1);
});
