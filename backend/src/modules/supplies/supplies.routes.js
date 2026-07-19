const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const emptyToNull = require('../../utils/emptyToNull');
const { requireRole } = require('../../core/middleware/role');
const { logEvent } = require('../../core/eventLog');

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
    const { rowCount } = await pool.query('DELETE FROM supplies WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
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

// Меняет остаток внутри транзакции (FOR UPDATE — защита от гонки при
// одновременном списании) и пишет движение в supply_movements.
async function applyMovement(req, type, quantity) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const supply = await client.query(
      'SELECT id, quantity FROM supplies WHERE id = $1 AND company_id = $2 FOR UPDATE',
      [req.params.id, req.tenant.companyId]
    );
    if (supply.rows.length === 0) {
      await client.query('ROLLBACK');
      return 'not_found';
    }

    const current = parseFloat(supply.rows[0].quantity);
    if (type === 'out' && current < quantity) {
      await client.query('ROLLBACK');
      return 'insufficient';
    }

    const delta = type === 'in' ? quantity : -quantity;
    const updated = await client.query(
      `UPDATE supplies SET quantity = quantity + $1 WHERE id = $2
       RETURNING id, name, unit, product_url, quantity, low_stock_threshold, created_at`,
      [delta, req.params.id]
    );
    await client.query(
      `INSERT INTO supply_movements (company_id, supply_id, type, quantity, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.tenant.companyId, req.params.id, type, quantity, req.user.id]
    );
    await client.query('COMMIT');
    return updated.rows[0];
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
    if (result === 'not_found') {
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

    res.json(withLowStock(result));
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
    if (result === 'not_found') {
      return res.status(404).json({ error: 'Позиция не найдена' });
    }
    if (result === 'insufficient') {
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

    res.json(withLowStock(result));
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
