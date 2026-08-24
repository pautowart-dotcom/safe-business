// Бесплатный аудит карточки Яндекс.Карт без регистрации (23.08.2026) —
// лид-магнит для той же аудитории, что и рассылка по базе студий из
// Яндекс.Карт. В отличие от anonymous-audit.routes.js здесь не заводится
// гостевой аккаунт — фича проще: одна ссылка → один ответ, без сессии.
// Движок вынесен в modules/yandex-card-audit, чтобы позже вызвать его же
// из авторизованного роута ЛК без изменений здесь.
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { checkLoginAllowed, recordFailedLogin } = require('../core/loginRateLimit');
const { auditCard } = require('../modules/yandex-card-audit');

const router = express.Router();

// Тихая обкатка, как у anonymous-audit.routes.js — фича первый раз делает
// исходящие запросы к стороннему сайту с прод-сервера, включаем явно после
// ручной проверки.
router.use((req, res, next) => {
  if (process.env.YANDEX_CARD_AUDIT_ENABLED === 'true') return next();
  res.status(404).json({ error: 'not_launched' });
});

const ERROR_STATUS = {
  INVALID_URL: 400,
  FETCH_FAILED: 502,
  PARSE_FAILED: 502,
  ORG_NOT_FOUND: 404,
};

router.post(
  '/',
  asyncHandler(async (req, res) => {
    // Лимит по IP — переиспользуем login_attempts, тот же приём, что у
    // leads-public.routes.js (identifier с префиксом вместо email).
    const identifier = `yandex-card-audit:${req.ip}`;
    const allowed = await checkLoginAllowed(req.ip, identifier);
    if (!allowed) {
      return res.status(429).json({ error: 'Слишком много проверок с этого адреса — попробуйте через 15 минут' });
    }
    // Считаем каждую попытку (успешную и нет) — иначе лимит обходится
    // простым повтором валидных запросов, как в leads-public.routes.js.
    await recordFailedLogin(req.ip, identifier);

    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Укажите ссылку на карточку' });
    }

    try {
      const result = await auditCard(url);
      res.json(result);
    } catch (err) {
      const status = ERROR_STATUS[err.code] || 500;
      res.status(status).json({ error: err.message || 'Не удалось проверить карточку' });
    }
  })
);

module.exports = router;
