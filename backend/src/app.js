const express = require('express');
const cors = require('cors');
const path = require('path');
require('./modules');
const { authRoutes, platformRouter, legalRoutes } = require('./platform');
const { mountModules } = require('./core/modules-registry');
const { UPLOADS_DIR, verifyFileUrlSignature } = require('./core/fileStorage');

function buildApp() {
  const app = express();
  // За nginx (deploy/nginx.conf выставляет X-Forwarded-For) — без этого
  // req.ip всегда был бы адресом самого nginx, а не клиента, и
  // rate limiting логина (core/loginRateLimit.js) бил бы по общей IP-корзине
  // для всех пользователей сразу.
  app.set('trust proxy', 1);
  // На проде (NODE_ENV=production, задаётся deploy/ecosystem.config.js)
  // CORS_ORIGIN обязателен — падаем при старте, а не тихо открываемся всем
  // источникам, если переменная забыта в .env на новом сервере (находка
  // security-review, 26.08.2026). В локальной разработке (NODE_ENV не
  // задан) остаётся прежний запасной вариант '*', ничего не меняется.
  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN не задан в окружении — на проде это обязательная переменная');
  }
  app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/platform', platformRouter);
  // Публичный доступ (без авторизации) — нужен на форме приёма приглашения
  // до создания аккаунта.
  app.use('/api/legal', legalRoutes);
  // Под /api/, чтобы отдавалось через тот же nginx/vite-прокси, что и
  // остальной бэкенд — без отдельного правила проксирования.
  // Раньше был голый express.static (любой, у кого оказалась ссылка, мог
  // скачать чужой файл бессрочно) — теперь отдаём только по подписанной
  // короткоживущей ссылке (core/fileStorage.js: signFileUrl/
  // verifyFileUrlSignature). Сама авторизация уже произошла один раз, там,
  // где URL достаётся из БД и отдаётся клиенту в JSON — этот роут просто
  // проверяет, что ссылка не поддельная и не просрочена.
  app.get('/api/uploads/:filename', (req, res) => {
    const { filename } = req.params;
    const { exp, sig } = req.query;
    if (!verifyFileUrlSignature(filename, exp, sig)) {
      return res.status(403).json({ error: 'Ссылка на файл недействительна или истекла — обновите страницу' });
    }
    res.sendFile(path.join(UPLOADS_DIR, filename), (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });
  mountModules(app);

  app.use((req, res) => {
    res.status(404).json({ error: 'Маршрут не найден' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    if (err.name === 'MulterError' || err.message === 'Файл должен быть изображением') {
      return res.status(400).json({ error: err.message === 'File too large' ? 'Файл слишком большой (максимум 8 МБ)' : err.message });
    }
    res.status(err.status || 500).json({ error: err.message || 'Внутренняя ошибка сервера' });
  });

  return app;
}

module.exports = buildApp;
