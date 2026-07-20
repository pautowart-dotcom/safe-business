const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const emptyToNull = require('../../utils/emptyToNull');
const { requireRole } = require('../../core/middleware/role');
const { logEvent } = require('../../core/eventLog');
const { applySupplyMovement } = require('../../core/supplyMovements');

const router = express.Router();

function withLowStock(row) {
  return { ...row, low_stock: parseFloat(row.quantity) <= parseFloat(row.low_stock_threshold) };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, name, unit, product_url, quantity, low_stock_threshold, created_at
       FROM supplies WHERE company_id = $1 ORDER BY name`,
      [req.tenant.companyId]
    );
    res.json(rows.map(withLowStock));
  })
);

// Управление позициями — только владелец (README: "Расходники — приход +
// списание, управление позициями" у владельца, "только списание" у мастера).
router.post(
  '/',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { name, unit, productUrl, quantity, lowStockThreshold } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Укажите название позиции' });
    }
    const { rows } = await pool.query(
      `INSERT INTO supplies (company_id, name, unit, product_url, quantity, low_stock_threshold)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, unit, product_url, quantity, low_stock_threshold, created_at`,
      [req.tenant.companyId, name, unit || null, productUrl || null, quantity || 0, lowStockThreshold || 0]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'supplies',
      userId: req.user.id,
      entityType: 'supply',
      entityId: rows[0].id,
      action: 'supply.created',
    });

    res.status(201).json(withLowStock(rows[0]));
  })
);

router.patch(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { name, unit, productUrl, lowStockThreshold } = req.body;
    const { rows } = await pool.query(
      `UPDATE supplies SET
         name = COALESCE($1, name),
         unit = COALESCE($2, unit),
         product_url = COALESCE($3, product_url),
         low_stock_threshold = COALESCE($4, low_stock_threshold)
       WHERE id = $5 AND company_id = $6
       RETURNING id, name, unit, product_url, quantity, low_stock_threshold, created_at`,
      [name || null, unit || null, productUrl || null, emptyToNull(lowStockThreshold), req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Позиция не найдена' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'supplies',
      userId: req.user.id,
      entityType: 'supply',
      entityId: rows[0].id,
      action: 'supply.updated',
    });

    res.json(withLowStock(rows[0]));
  })
);

router.delete(
  '/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    let rowCount;
    try {
      ({ rowCount } = await pool.query('DELETE FROM supplies WHERE id = $1 AND company_id = $2', [
        req.params.id,
        req.tenant.companyId,
      ]));
    } catch (err) {
      // visit_supplies.supply_id -> supplies(id) ON DELETE RESTRICT: расходник
      // уже фигурирует в истории визитов, нельзя стереть без потери учёта.
      if (err.code === '23503') {
        return res.status(400).json({ error: 'Нельзя удалить: расходник уже использован в визитах' });
      }
      throw err;
    }
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Позиция не найдена' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'supplies',
      userId: req.user.id,
      entityType: 'supply',
      entityId: Number(req.params.id),
      action: 'supply.deleted',
    });

    res.status(204).end();
  })
);

// Обёртка над core/supplyMovements.applySupplyMovement — открывает
// транзакцию, отдаёт актуальную строку расходника при успехе.
async function applyMovement(req, type, quantity) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await applySupplyMovement(client, {
      companyId: req.tenant.companyId,
      supplyId: req.params.id,
      type,
      quantity,
      userId: req.user.id,
    });
    if (result.status !== 'ok') {
      await client.query('ROLLBACK');
      return result;
    }
    const updated = await client.query(
      `SELECT id, name, unit, product_url, quantity, low_stock_threshold, created_at FROM supplies WHERE id = $1`,
      [req.params.id]
    );
    await client.query('COMMIT');
    return { status: 'ok', supply: updated.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// "Пришло" — приход товара, только владелец.
router.post(
  '/:id/receive',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const quantity = parseFloat(req.body.quantity);
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Укажите положительное количество' });
    }

    const result = await applyMovement(req, 'in', quantity);
    if (result.status === 'not_found') {
      return res.status(404).json({ error: 'Позиция не найдена' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'supplies',
      userId: req.user.id,
      entityType: 'supply',
      entityId: Number(req.params.id),
      action: 'supply.received',
      payload: { quantity },
    });

    res.json(withLowStock(result.supply));
  })
);

// "Списать" — доступно и владельцу, и мастеру.
router.post(
  '/:id/deduct',
  asyncHandler(async (req, res) => {
    const quantity = parseFloat(req.body.quantity);
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Укажите положительное количество' });
    }

    const result = await applyMovement(req, 'out', quantity);
    if (result.status === 'not_found') {
      return res.status(404).json({ error: 'Позиция не найдена' });
    }
    if (result.status === 'insufficient') {
      return res.status(400).json({ error: 'Недостаточно остатка для списания' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'supplies',
      userId: req.user.id,
      entityType: 'supply',
      entityId: Number(req.params.id),
      action: 'supply.deducted',
      payload: { quantity },
    });

    res.json(withLowStock(result.supply));
  })
);

router.get(
  '/:id/movements',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT sm.id, sm.type, sm.quantity, sm.created_at, u.name AS user_name
       FROM supply_movements sm
       LEFT JOIN users u ON u.id = sm.created_by_user_id
       WHERE sm.supply_id = $1 AND sm.company_id = $2
       ORDER BY sm.created_at DESC LIMIT 100`,
      [req.params.id, req.tenant.companyId]
    );
    res.json(rows);
  })
);

module.exports = router;
