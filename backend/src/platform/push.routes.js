// Пакет 3, Этап 9: подписка/отписка Web Push + тестовая отправка (кнопка
// в Настройках, чтобы проверить, что push реально доходит до устройства).
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { sendPushToCompany, isPushConfigured } = require('../core/pushNotify');

const router = express.Router();
router.use(requireAuth, requireTenant);

router.get(
  '/vapid-public-key',
  asyncHandler(async (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null, configured: isPushConfigured() });
  })
);

router.post(
  '/subscribe',
  asyncHandler(async (req, res) => {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Некорректные данные подписки' });
    }
    await pool.query(
      `INSERT INTO push_subscriptions (company_id, membership_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET company_id = EXCLUDED.company_id, membership_id = EXCLUDED.membership_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [req.tenant.companyId, req.tenant.membershipId, endpoint, keys.p256dh, keys.auth]
    );
    res.status(201).json({ ok: true });
  })
);

router.delete(
  '/subscribe',
  asyncHandler(async (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'Не указан endpoint подписки' });
    }
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND company_id = $2', [endpoint, req.tenant.companyId]);
    res.status(204).end();
  })
);

// Тестовое уведомление — идёт через тот же sendPushToCompany (с проверкой
// тумблера категории), чтобы кнопка в Настройках проверяла реальный путь
// доставки, а не отдельный тестовый код.
router.post(
  '/test',
  asyncHandler(async (req, res) => {
    if (!isPushConfigured()) {
      return res.status(400).json({ error: 'Push не настроен на сервере (нет VAPID-ключей)' });
    }
    // Пакет 4, Этап 1: категории синхронизированы со списком в deadlines.routes.js.
    const category = ['staff', 'premises', 'documents', 'tax', 'journals', 'financial'].includes(req.body.category)
      ? req.body.category
      : 'documents';
    const result = await sendPushToCompany({
      companyId: req.tenant.companyId,
      category,
      title: 'Тестовое уведомление',
      body: 'Если вы это видите — push работает.',
      url: '/settings',
      onlyMembershipId: req.tenant.membershipId,
    });

    if (result.subscriptions === 0) {
      return res.status(400).json({ error: 'Нет активной подписки на этом устройстве — включите уведомления заново' });
    }
    if (result.sent === 0) {
      // Самая частая причина — устройство подписано на старые VAPID-ключи
      // (например ключи сервера пересоздали) — служба push отвечает
      // ошибкой, но не 404/410, поэтому подписка не чистится сама.
      const detail = result.errors[0]?.message || result.errors[0]?.statusCode || 'неизвестная ошибка';
      return res.status(502).json({
        error: `Push не дошёл (${detail}) — попробуйте отключить и снова включить уведомления в Настройках, чтобы обновить подписку`,
      });
    }
    res.json({ ok: true, sent: result.sent, failed: result.failed });
  })
);

module.exports = router;
