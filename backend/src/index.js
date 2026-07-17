require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const clientRoutes = require('./routes/clients');
const visitRoutes = require('./routes/visits');
const financeRoutes = require('./routes/finance');
const supplyRoutes = require('./routes/supplies');
const checklistRoutes = require('./routes/checklists');
const knowledgeRoutes = require('./routes/knowledge');
const securityRoutes = require('./routes/security');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/supplies', supplyRoutes);
app.use('/api/checklists', checklistRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/security', securityRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Внутренняя ошибка сервера' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Сервер "Безопасный бизнес" запущен на порту ${port}`);
});
