require('dotenv').config();
const buildApp = require('./app');
const { syncModulesTable } = require('./core/modules-registry');

async function start() {
  await syncModulesTable();
  const app = buildApp();
  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    console.log(`Платформа «Безопасный бизнес» запущена на порту ${port}`);
  });
}

start().catch((err) => {
  console.error('Не удалось запустить сервер:', err);
  process.exit(1);
});
