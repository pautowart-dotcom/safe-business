const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const emptyToNull = require('../../utils/emptyToNull');
const { requireRole } = require('../../core/middleware/role');
const { logEvent } = require('../../core/eventLog');
const { logAudit } = require('../../core/auditLog');
const { applySupplyMovement } = require('../../core/supplyMovements');

const router = express.Router();

function withLowStock(row) {
  return { ...row, low_stock: parseFloat(row.quantity) <= parseFloat(row.low_stock_threshold) };
}

// Пакет 3, Этап 10 п.2: категории — настраиваемые владельцем/админом, не
// зашитые в код (было раньше два фиксированных "работа"/"бар"). Свободный
// список на компанию, расходник может быть без категории (category_id NULL).
router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT id, name, sort_order FROM supply_categories WHERE company_id = $1 ORDER BY sort_order, name',
      [req.tenant.companyId]
    );
    res.json(rows);
  })
);

router.post(
  '/categories',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Укажите название категории' });
    }
    const next = await pool.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM supply_categories WHERE company_id = $1', [
      req.tenant.companyId,
    ]);
    const { rows } = await pool.query(
      `INSERT INTO supply_categories (company_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id, name, sort_order`,
      [req.tenant.companyId, name.trim(), next.rows[0].next]
    );
    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/categories/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { name, sortOrder } = req.body;
    const { rows } = await pool.query(
      `UPDATE supply_categories SET name = COALESCE($1, name), sort_order = COALESCE($2, sort_order)
       WHERE id = $3 AND company_id = $4 RETURNING id, name, sort_order`,
      [name?.trim() || null, sortOrder ?? null, req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    res.json(rows[0]);
  })
);

// Удаление категории НЕ удаляет расходники — они просто становятся "без
// категории" (supplies.category_id ON DELETE SET NULL), тот же принцип,
// что и отключение модуля не стирает данные (Этап 1.1).
router.delete(
  '/categories/:id',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM supply_categories WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }
    res.status(204).end();
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.unit, s.product_url, s.quantity, s.low_stock_threshold, s.is_disinfectant,
              s.category_id, sc.name AS category_name, s.created_at
       FROM supplies s
       LEFT JOIN supply_categories sc ON sc.id = s.category_id
       WHERE s.company_id = $1 ORDER BY s.name`,
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
    const { name, unit, productUrl, quantity, lowStockThreshold, isDisinfectant, categoryId } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Укажите название позиции' });
    }
    if (categoryId) {
      const cat = await pool.query('SELECT 1 FROM supply_categories WHERE id = $1 AND company_id = $2', [categoryId, req.tenant.companyId]);
      if (cat.rows.length === 0) {
        return res.status(400).json({ error: 'Категория не найдена в этой компании' });
      }
    }
    const { rows } = await pool.query(
      `INSERT INTO supplies (company_id, name, unit, product_url, quantity, low_stock_threshold, is_disinfectant, category_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, unit, product_url, quantity, low_stock_threshold, is_disinfectant, category_id, created_at`,
      [req.tenant.companyId, name, unit || null, productUrl || null, quantity || 0, lowStockThreshold || 0, !!isDisinfectant, categoryId || null]
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
    const { name, unit, productUrl, lowStockThreshold, isDisinfectant, categoryId } = req.body;
    // is_disinfectant/category_id — false/NULL тоже валидные значения (снять
    // тег, снять категорию), поэтому обычный COALESCE (как для остальных
    // полей) сюда не подходит: обновляем, только если поле реально пришло в
    // запросе — та же схема, что и kind в checklists.routes.js.
    const categoryProvided = 'categoryId' in req.body;
    if (categoryProvided && categoryId) {
      const cat = await pool.query('SELECT 1 FROM supply_categories WHERE id = $1 AND company_id = $2', [categoryId, req.tenant.companyId]);
      if (cat.rows.length === 0) {
        return res.status(400).json({ error: 'Категория не найдена в этой компании' });
      }
    }
    const { rows } = await pool.query(
      `UPDATE supplies SET
         name = COALESCE($1, name),
         unit = COALESCE($2, unit),
         product_url = COALESCE($3, product_url),
         low_stock_threshold = COALESCE($4, low_stock_threshold),
         is_disinfectant = CASE WHEN $7 THEN $8 ELSE is_disinfectant END,
         category_id = CASE WHEN $9 THEN $10 ELSE category_id END
       WHERE id = $5 AND company_id = $6
       RETURNING id, name, unit, product_url, quantity, low_stock_threshold, is_disinfectant, category_id, created_at`,
      [
        name || null,
        unit || null,
        productUrl || null,
        emptyToNull(lowStockThreshold),
        req.params.id,
        req.tenant.companyId,
        isDisinfectant !== undefined,
        !!isDisinfectant,
        categoryProvided,
        categoryId || null,
      ]
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
    await logAudit({
      companyId: req.tenant.companyId,
      userId: req.user.id,
      action: 'supply.deleted',
      entityType: 'supply',
      entityId: Number(req.params.id),
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
      `SELECT id, name, unit, product_url, quantity, low_stock_threshold, is_disinfectant, created_at FROM supplies WHERE id = $1`,
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
