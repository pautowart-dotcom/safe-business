// Универсальный роут страницы перехода статуса бизнеса (Фаза 1) — рендерит
// steps[] из content/repository.js для любого transition_key, прогресс
// хранится в business_status_transitions.steps_state. Один роут на все
// переходы (сейчас — один self_employed_to_ip), не по экрану на переход.
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { requirePaidPlan } = require('../core/middleware/subscription');
const { clearAction } = require('../core/deadlines');
const { getTransition } = require('../modules/business-status/content/repository');

const router = express.Router();
// owner-only + платная подписка — та же чувствительность данных (выручка,
// налоговый статус), что и "Мои сроки", и тот же гейт, что план требует
// для живого триггера/страницы перехода (§7): бесплатно остаётся только
// статичная рекомендация в анонимном интейке (roadmap), не этот экран.
router.use(requireAuth, requireTenant, requireRole('owner'), requirePaidPlan);

const STATUSES = ['suggested', 'in_progress', 'dismissed', 'completed'];

router.get(
  '/:transitionKey',
  asyncHandler(async (req, res) => {
    const content = getTransition(req.params.transitionKey);
    if (!content) return res.status(404).json({ error: 'Неизвестный переход' });

    const { rows } = await pool.query(
      `SELECT status, trigger_reason AS "triggerReason", steps_state AS "stepsState",
              to_char(created_at, 'YYYY-MM-DD') AS "createdAt"
       FROM business_status_transitions WHERE company_id = $1 AND transition_key = $2`,
      [req.tenant.companyId, req.params.transitionKey]
    );
    const state = rows[0];

    res.json({
      content: {
        key: content.key,
        title: content.title,
        intro: content.intro,
        status: content.status,
        lawReference: content.lawReference,
        fromLegalForm: content.fromLegalForm,
        toLegalForm: content.toLegalForm,
        steps: content.steps,
      },
      state: state
        ? { status: state.status, triggerReason: state.triggerReason, stepsState: state.stepsState || {}, createdAt: state.createdAt }
        : null,
    });
  })
);

router.patch(
  '/:transitionKey',
  asyncHandler(async (req, res) => {
    const content = getTransition(req.params.transitionKey);
    if (!content) return res.status(404).json({ error: 'Неизвестный переход' });

    const { status, stepsState } = req.body;
    if (status !== undefined && !STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Недопустимый статус' });
    }

    const { rows } = await pool.query(
      `UPDATE business_status_transitions SET
         status = COALESCE($3, status),
         steps_state = COALESCE($4::jsonb, steps_state),
         updated_at = now()
       WHERE company_id = $1 AND transition_key = $2
       RETURNING status, trigger_reason AS "triggerReason", steps_state AS "stepsState"`,
      [req.tenant.companyId, req.params.transitionKey, status || null, stepsState ? JSON.stringify(stepsState) : null]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Переход ещё не предложен' });

    // completed/dismissed — снимаем карточку из Центра действий сразу, не
    // дожидаясь завтрашнего прогона cron: владелец только что сам нажал
    // кнопку на этой же странице, задержка до утра выглядела бы как баг
    // (в отличие от dailyOperationsNudges, где сутки ожидания — норма).
    if (status === 'completed' || status === 'dismissed') {
      await clearAction({
        relatedEntityType: `business_status:${req.params.transitionKey}`,
        relatedEntityId: req.tenant.companyId,
        category: 'tax',
      });
    }

    res.json(rows[0]);
  })
);

module.exports = router;
