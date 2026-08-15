const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../core/middleware/role');
const { logEvent } = require('../../core/eventLog');
const emptyToNull = require('../../utils/emptyToNull');

const router = express.Router();

// includeInactive — управление каталогом (Настройки) показывает всё, чтобы
// можно было вернуть услугу обратно; выбор услуги в форме визита по
// умолчанию видит только активные.
// payout_* — переопределение оплаты мастеру на этой услуге (15.08.2026),
// та же чувствительность, что unit_cost у расходников — мастеру в ответе
// не отдаём вообще, не просто скрываем на фронте.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const params = [req.tenant.companyId];
    let where = 'company_id = $1';
    if (!req.query.includeInactive) {
      where += ' AND active = true';
    }
    const { rows } = await pool.query(
      `SELECT id, niche, name, duration_minutes, approx_price, payout_type, payout_percent, payout_fixed_amount, active, created_at
       FROM services WHERE ${where} ORDER BY niche NULLS FIRST, name`,
      params
    );
    if (req.tenant.role === 'master') {
      return res.json(rows.map(({ payout_type, payout_percent, payout_fixed_amount, ...rest }) => rest));
    }
    res.json(rows);
  })
);

// Мастер тоже может завести новую услугу прямо из формы визита (по плану —
// "выбирает услугу из каталога или добавляет новую"), тот же прецедент, что
// уже есть у расходников (supplies.routes.js, решение владельца 05.08.2026).
// Редактирование/архивирование — ниже, только owner/admin: длительность
// влияет на будущую метрику загрузки по всей компании, не должна меняться
// произвольно с любого визита.
router.post(
  '/',
  requireRole('owner', 'admin', 'master'),
  asyncHandler(async (req, res) => {
    const { name, niche, durationMinutes, approxPrice, payoutType, payoutPercent, payoutFixedAmount } = req.body;
    if (!name || !name.trim() || !durationMinutes || Number(durationMinutes) <= 0) {
      return res.status(400).json({ error: 'Укажите название и длительность услуги (в минутах)' });
    }
    if (payoutType !== undefined && payoutType !== null && payoutType !== '' && !['percent', 'fixed'].includes(payoutType)) {
      return res.status(400).json({ error: 'Некорректный тип оплаты (только percent или fixed на услуге)' });
    }
    const dup = await pool.query(
      'SELECT 1 FROM services WHERE company_id = $1 AND LOWER(name) = LOWER($2) AND niche IS NOT DISTINCT FROM $3 AND active = true',
      [req.tenant.companyId, name.trim(), niche || null]
    );
    if (dup.rows.length > 0) {
      return res.status(400).json({ error: 'Такая услуга уже есть в каталоге' });
    }
    // Переопределение оплаты — только owner/admin, мастер (тоже может
    // создавать услуги на лету из формы визита) это поле не задаёт даже
    // если пришлёт — тихо игнорируем, тот же приём, что unitCost в
    // supplies.routes.js.
    const isPayoutManager = req.tenant.role === 'owner' || req.tenant.role === 'admin';
    const { rows } = await pool.query(
      `INSERT INTO services (company_id, niche, name, duration_minutes, approx_price, payout_type, payout_percent, payout_fixed_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, niche, name, duration_minutes, approx_price, payout_type, payout_percent, payout_fixed_amount, active, created_at`,
      [
        req.tenant.companyId,
        niche || null,
        name.trim(),
        Math.round(Number(durationMinutes)),
        approxPrice || null,
        isPayoutManager ? payoutType || null : null,
        isPayoutManager ? payoutPercent || null : null,
        isPayoutManager ? payoutFixedAmount || null : null,
      ]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'visits',
      userId: req.user.id,
      entityType: 'service',
      entityId: rows[0].id,
      action: 'service.created',
    });

    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { name, niche, durationMinutes, approxPrice, active, payoutType, payoutPercent, payoutFixedAmount } = req.body;
    const nicheProvided = 'niche' in req.body;
    if (payoutType !== undefined && payoutType !== null && payoutType !== '' && !['percent', 'fixed'].includes(payoutType)) {
      return res.status(400).json({ error: 'Некорректный тип оплаты (только percent или fixed на услуге)' });
    }
    const payoutTypeProvided = 'payoutType' in req.body;
    const { rows } = await pool.query(
      `UPDATE services SET
         name = COALESCE($1, name),
         niche = CASE WHEN $2 THEN $3 ELSE niche END,
         duration_minutes = COALESCE($4, duration_minutes),
         approx_price = COALESCE($5, approx_price),
         active = COALESCE($6, active),
         payout_type = CASE WHEN $9 THEN $10 ELSE payout_type END,
         payout_percent = COALESCE($11, payout_percent),
         payout_fixed_amount = COALESCE($12, payout_fixed_amount)
       WHERE id = $7 AND company_id = $8
       RETURNING id, niche, name, duration_minutes, approx_price, payout_type, payout_percent, payout_fixed_amount, active, created_at`,
      [
        name?.trim() || null,
        nicheProvided,
        niche || null,
        durationMinutes ? Math.round(Number(durationMinutes)) : null,
        emptyToNull(approxPrice),
        emptyToNull(active),
        req.params.id,
        req.tenant.companyId,
        payoutTypeProvided,
        payoutType || null,
        emptyToNull(payoutPercent),
        emptyToNull(payoutFixedAmount),
      ]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Услуга не найдена' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'visits',
      userId: req.user.id,
      entityType: 'service',
      entityId: rows[0].id,
      action: 'service.updated',
    });

    res.json(rows[0]);
  })
);

module.exports = router;
