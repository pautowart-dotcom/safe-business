const express = require('express');
const cors = require('cors');
require('./modules');
const { authRoutes, platformRouter, legalRoutes } = require('./platform');
const { mountModules } = require('./core/modules-registry');
const { UPLOADS_DIR } = require('./core/uploads');

function buildApp() {
  const app = express();
  // За nginx (deploy/nginx.conf выставляет X-Forwarded-For) — без этого
  // req.ip всегда был бы адресом самого nginx, а не клиента, и
  // rate limiting логина (core/loginRateLimit.js) бил бы по общей IP-корзине
  // для всех пользователей сразу.
  app.set('trust proxy', 1);
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
  app.use('/api/uploads', express.static(UPLOADS_DIR));
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
