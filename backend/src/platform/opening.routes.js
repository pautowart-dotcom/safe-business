// Открытие внутри системы (16.10.2026, docs/franchise-funkcional.md §11,
// этап 1: Ф8/Ф9). Для всех компаний (решение владельца 10.10: открытие
// внутри системы — для всех клиентов, не только для франшизы). Компания
// видит и меняет только свои данные (req.tenant.companyId).
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { logEvent } = require('../core/eventLog');
const { getOpening, itemKeys } = require('../modules/roadmap/opening');

const router = express.Router();

// Мастеру роадмап открытия не нужен — ведут владелец и администратор.
router.use(requireAuth, requireTenant, requireRole('owner', 'admin'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const opening = await getOpening(req.tenant.companyId);
    if (!opening) return res.status(404).json({ error: 'Компания не найдена' });
    res.json(opening);
  })
);

// Отметить / снять отметку с пункта: { done: true | false }.
router.put(
  '/items/:key',
  asyncHandler(async (req, res) => {
    const { done } = req.body || {};
    if (typeof done !== 'boolean') {
      return res.status(400).json({ error: 'done должен быть true или false' });
    }
    const opening = await getOpening(req.tenant.companyId);
    if (!itemKeys(opening).has(req.params.key)) {
      return res.status(404).json({ error: 'Пункт не найден' });
    }

    if (done) {
      await pool.query(
        `INSERT INTO company_opening_items (company_id, item_key, done_by_user_id) VALUES ($1, $2, $3)
         ON CONFLICT (company_id, item_key) DO NOTHING`,
        [req.tenant.companyId, req.params.key, req.user.id]
      );
    } else {
      await pool.query(`DELETE FROM company_opening_items WHERE company_id = $1 AND item_key = $2`, [
        req.tenant.companyId,
        req.params.key,
      ]);
    }
    res.json(await getOpening(req.tenant.companyId));
  })
);

// Сменить режим: { status: 'preparing' | 'open' }. «Открылись» — только
// владелец; вернуться в подготовку можно, если нажали по ошибке.
router.patch(
  '/status',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    if (!['preparing', 'open'].includes(status)) {
      return res.status(400).json({ error: 'status должен быть preparing или open' });
    }
    await pool.query(
      `UPDATE companies SET opening_status = $1::varchar,
         opened_at = CASE WHEN $1::varchar = 'open' THEN COALESCE(opened_at, now()) ELSE NULL END
       WHERE id = $2`,
      [status, req.tenant.companyId]
    );
    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'company',
      entityId: req.tenant.companyId,
      action: status === 'open' ? 'opening.opened' : 'opening.preparing',
    });
    res.json(await getOpening(req.tenant.companyId));
  })
);

module.exports = router;
