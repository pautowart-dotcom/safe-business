// Наборы расходников (16.08.2026) — именованный шаблон "расходник +
// количество" для быстрого заполнения списка расходников визита одним
// кликом вместо ручного добавления каждой позиции. Доступ всем ролям
// модуля (owner/admin/master) — тот же принцип, что и у создания расходников/
// услуг на лету: не сущность с чувствительными данными (ни цены, ни зарплаты),
// смысл фичи именно в скорости работы мастера, ограничивать создание было бы
// против цели.
const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { logEvent } = require('../../core/eventLog');

const router = express.Router();

async function loadItems(packageIds) {
  if (packageIds.length === 0) return {};
  const { rows } = await pool.query(
    `SELECT spi.package_id, spi.supply_id, spi.quantity, s.name, s.unit
     FROM supply_package_items spi
     JOIN supplies s ON s.id = spi.supply_id
     WHERE spi.package_id = ANY($1)
     ORDER BY s.name`,
    [packageIds]
  );
  const byPackage = {};
  for (const r of rows) {
    (byPackage[r.package_id] ||= []).push({
      supplyId: r.supply_id,
      name: r.name,
      unit: r.unit,
      quantity: parseFloat(r.quantity),
    });
  }
  return byPackage;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT id, name, created_at FROM supply_packages WHERE company_id = $1 ORDER BY name',
      [req.tenant.companyId]
    );
    const itemsByPackage = await loadItems(rows.map((r) => r.id));
    res.json(rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, items: itemsByPackage[r.id] || [] })));
  })
);

// items — [{ supplyId, quantity }], validируем, что все расходники реально
// принадлежат этой компании (иначе можно было бы сослаться на чужой id).
async function validateItems(companyId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 'Добавьте хотя бы один расходник в набор';
  }
  for (const it of items) {
    if (!it.supplyId || !it.quantity || Number(it.quantity) <= 0) {
      return 'У каждой позиции должны быть расходник и количество больше нуля';
    }
  }
  const ids = items.map((it) => it.supplyId);
  const { rows } = await pool.query('SELECT id FROM supplies WHERE id = ANY($1) AND company_id = $2', [ids, companyId]);
  if (rows.length !== new Set(ids).size) {
    return 'Один из расходников не найден в этой компании';
  }
  return null;
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, items } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Укажите название набора' });
    }
    const error = await validateItems(req.tenant.companyId, items);
    if (error) return res.status(400).json({ error });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const pkg = await client.query(
        'INSERT INTO supply_packages (company_id, name) VALUES ($1, $2) RETURNING id, name, created_at',
        [req.tenant.companyId, name.trim()]
      );
      for (const it of items) {
        await client.query(
          'INSERT INTO supply_package_items (package_id, supply_id, quantity) VALUES ($1, $2, $3)',
          [pkg.rows[0].id, it.supplyId, it.quantity]
        );
      }
      await client.query('COMMIT');

      const itemsByPackage = await loadItems([pkg.rows[0].id]);
      await logEvent({
        companyId: req.tenant.companyId,
        moduleKey: 'supplies',
        userId: req.user.id,
        entityType: 'supply_package',
        entityId: pkg.rows[0].id,
        action: 'supply_package.created',
      });
      res.status(201).json({ id: pkg.rows[0].id, name: pkg.rows[0].name, createdAt: pkg.rows[0].created_at, items: itemsByPackage[pkg.rows[0].id] || [] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// PATCH — переименование и/или полная замена состава набора (проще и
// надёжнее, чем differential-обновление отдельных позиций: набор — это
// шаблон на несколько строк, не история, пересобрать целиком безопасно).
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, items } = req.body;
    const existing = await pool.query('SELECT id FROM supply_packages WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Набор не найден' });
    }
    if (items !== undefined) {
      const error = await validateItems(req.tenant.companyId, items);
      if (error) return res.status(400).json({ error });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (name) {
        await client.query('UPDATE supply_packages SET name = $1 WHERE id = $2', [name.trim(), req.params.id]);
      }
      if (items !== undefined) {
        await client.query('DELETE FROM supply_package_items WHERE package_id = $1', [req.params.id]);
        for (const it of items) {
          await client.query(
            'INSERT INTO supply_package_items (package_id, supply_id, quantity) VALUES ($1, $2, $3)',
            [req.params.id, it.supplyId, it.quantity]
          );
        }
      }
      await client.query('COMMIT');

      const pkg = await pool.query('SELECT id, name, created_at FROM supply_packages WHERE id = $1', [req.params.id]);
      const itemsByPackage = await loadItems([Number(req.params.id)]);

      await logEvent({
        companyId: req.tenant.companyId,
        moduleKey: 'supplies',
        userId: req.user.id,
        entityType: 'supply_package',
        entityId: Number(req.params.id),
        action: 'supply_package.updated',
      });
      res.json({ id: pkg.rows[0].id, name: pkg.rows[0].name, createdAt: pkg.rows[0].created_at, items: itemsByPackage[pkg.rows[0].id] || [] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM supply_packages WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Набор не найден' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'supplies',
      userId: req.user.id,
      entityType: 'supply_package',
      entityId: Number(req.params.id),
      action: 'supply_package.deleted',
    });
    res.status(204).end();
  })
);

module.exports = router;
