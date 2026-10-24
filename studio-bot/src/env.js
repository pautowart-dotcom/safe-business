// Простой загрузчик .env без зависимостей: KEY=value, # — комментарий.
// Уже заданные переменные окружения не перетирает.
const fs = require('fs');
const path = require('path');

function loadEnv(file = path.join(__dirname, '..', '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

module.exports = { loadEnv };
