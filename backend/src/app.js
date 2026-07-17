const express = require('express');
const cors = require('cors');
require('./modules');
const { authRoutes, platformRouter } = require('./platform');
const { mountModules } = require('./core/modules-registry');

function buildApp() {
  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/platform', platformRouter);
  mountModules(app);

  app.use((req, res) => {
    res.status(404).json({ error: 'Маршрут не найден' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Внутренняя ошибка сервера' });
  });

  return app;
}

module.exports = buildApp;
