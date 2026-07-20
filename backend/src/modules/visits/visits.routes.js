const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { logEvent } = require('../../core/eventLog');
const { logAudit } = require('../../core/auditLog');
const { uploadPhoto } = require('../../core/uploads');
const { saveImage, getFileUrl } = require('../../core/fileStorage');
const { applySupplyMovement } = require('../../core/supplyMovements');

const router = express.Router();

// Фото до/после визита — сжимаются и сохраняются через core/fileStorage.js
// (Этап 10), отдаём URL для записи в visits.photo_before_url/after_url.
router.post(
  '/photos',
  uploadPhoto,
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const filename = await saveImage(req.file.buffer);
    res.status(201).json({ url: getFileUrl(filename) });
  })
);

// Общий SELECT: считаем сумму скидки, итог и заработок мастера прямо в SQL,
// чтобы не расходиться в округлении между разными эндпоинтами.
const SELECT_COLUMNS = `
  v.id, v.branch_id, v.client_id, v.master_membership_id, v.service, v.materials,
  v.amount, v.discount_percent, v.master_payout_percent,
  ROUND(v.amount * v.discount_percent / 100, 2) AS discount_amount,
  ROUND(v.amount - (v.amount * v.discount_percent / 100), 2) AS final_amount,
  ROUND(v.amount * v.master_payout_percent / 100, 2) AS master_earnings,
  v.photo_before_url, v.photo_after_url, v.visit_at, v.created_at,
  c.first_name AS client_first_name, c.last_name AS client_last_name,
  mu.name AS master_name
`;

const FROM_CLAUSE = `
  FROM visits v
  JOIN clients c ON c.id = v.client_id
  LEFT JOIN memberships mm ON mm.id = v.master_membership_id
  LEFT JOIN users mu ON mu.id = mm.user_id
`;

// Этап 8: расходники, отмеченные мастером как использованные в визите
// (docs/task-batch-2.txt — вариант "ручной выбор в визите", без каталога
// услуг/рецептов). Один батч-запрос на весь список визитов, не N+1.
async function attachSupplies(rows) {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.id);
  const { rows: vs } = await pool.query(
    `SELECT vs.visit_id, vs.supply_id, vs.quantity, s.name, s.unit
     FROM visit_supplies vs JOIN supplies s ON s.id = vs.supply_id
     WHERE vs.visit_id = ANY($1)`,
    [ids]
  );
  const byVisit = {};
  for (const r of vs) {
    (byVisit[r.visit_id] ||= []).push({ supplyId: r.supply_id, quantity: r.quantity, name: r.name, unit: r.unit });
  }
  return rows.map((r) => ({ ...r, supplies: byVisit[r.id] || [] }));
}

// Списывает расходники визита внутри уже открытой транзакции. Возвращает
// { error } — если какого-то расходника не хватает, вызывающий код
// откатывает всю транзакцию (визит не создаётся/не обновляется наполовину).
async function applyVisitSupplies(client, { companyId, visitId, userId, supplies }) {
  for (const item of supplies) {
    const quantity = parseFloat(item.quantity);
    if (!item.supplyId || !quantity || quantity <= 0) {
      return { error: 'Укажите расходник и положительное количество' };
    }
    const result = await applySupplyMovement(client, { companyId, supplyId: item.supplyId, type: 'out', quantity, userId });
    if (result.status === 'not_found') {
      return { error: 'Расходник не найден в этой компании' };
    }
    if (result.status === 'insufficient') {
      return { error: `Недостаточно остатка расходника «${result.name}» для списания` };
    }
    await client.query(
      `INSERT INTO visit_supplies (company_id, visit_id, supply_id, quantity) VALUES ($1, $2, $3, $4)`,
      [companyId, visitId, item.supplyId, quantity]
    );
  }
  return { error: null };
}

// Возвращает списанные расходники визита обратно на склад и убирает связь —
// используется перед пересохранением списка расходников визита (PATCH) и
// перед удалением визита, чтобы остаток не "терялся" молча.
async function restockVisitSupplies(client, { companyId, visitId, userId }) {
  const { rows } = await client.query('SELECT supply_id, quantity FROM visit_supplies WHERE visit_id = $1', [visitId]);
  for (const row of rows) {
    await applySupplyMovement(client, { companyId, supplyId: row.supply_id, type: 'in', quantity: parseFloat(row.quantity), userId });
  }
  await client.query('DELETE FROM visit_supplies WHERE visit_id = $1', [visitId]);
}

// Мастер видит и ведёт только свои визиты (README, раздел "Визиты").
// Владелец видит все и может назначать мастера.
async function resolveMasterMembership(companyId, tenant, requestedMasterMembershipId) {
  if (tenant.role === 'master') {
    return tenant.membershipId;
  }

  if (!requestedMasterMembershipId) {
    return null; // владелец обязан указать мастера — проверяется вызывающим кодом
  }
  const { rows } = await pool.query(
    `SELECT id FROM memberships WHERE id = $1 AND company_id = $2 AND role = 'master'`,
    [requestedMasterMembershipId, companyId]
  );
  return rows.length > 0 ? rows[0].id : null;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const params = [req.tenant.companyId];
    let where = 'v.company_id = $1';

    if (req.tenant.role === 'master') {
      params.push(req.tenant.membershipId);
      where += ` AND v.master_membership_id = $${params.length}`;
    } else if (req.query.masterMembershipId) {
      params.push(req.query.masterMembershipId);
      where += ` AND v.master_membership_id = $${params.length}`;
    }

    if (req.query.branchId) {
      params.push(req.query.branchId);
      where += ` AND v.branch_id = $${params.length}`;
    }
    if (req.query.dateFrom) {
      params.push(req.query.dateFrom);
      where += ` AND v.visit_at >= $${params.length}`;
    }
    if (req.query.dateTo) {
      params.push(req.query.dateTo);
      where += ` AND v.visit_at <= $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE}
       WHERE ${where} ORDER BY v.visit_at DESC LIMIT 200`,
      params
    );
    res.json(await attachSupplies(rows));
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const params = [req.params.id, req.tenant.companyId];
    let where = 'v.id = $1 AND v.company_id = $2';
    if (req.tenant.role === 'master') {
      params.push(req.tenant.membershipId);
      where += ` AND v.master_membership_id = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} WHERE ${where}`,
      params
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Визит не найден' });
    }
    res.json((await attachSupplies(rows))[0]);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      clientId,
      service,
      materials,
      amount,
      discountPercent,
      visitAt,
      branchId,
      photoBeforeUrl,
      photoAfterUrl,
      masterMembershipId,
      supplies,
    } = req.body;

    if (!clientId || !service || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'Укажите клиента, услугу и сумму визита' });
    }

    const client = await pool.query('SELECT 1 FROM clients WHERE id = $1 AND company_id = $2', [
      clientId,
      req.tenant.companyId,
    ]);
    if (client.rows.length === 0) {
      return res.status(400).json({ error: 'Клиент не найден в этой компании' });
    }

    if (req.tenant.role !== 'master' && !masterMembershipId) {
      return res.status(400).json({ error: 'Укажите мастера, который выполнил визит' });
    }
    const resolvedMasterId = await resolveMasterMembership(req.tenant.companyId, req.tenant, masterMembershipId);
    if (!resolvedMasterId) {
      return res.status(400).json({ error: 'Мастер не найден в этой компании' });
    }

    const master = await pool.query('SELECT payout_percent FROM memberships WHERE id = $1', [resolvedMasterId]);
    const payoutPercent = master.rows[0].payout_percent;
    if (payoutPercent === null) {
      return res.status(400).json({ error: 'Для этого мастера не задан процент выплаты — попросите владельца указать его в разделе «Команда»' });
    }

    const dbClient = await pool.connect();
    let visitId;
    try {
      await dbClient.query('BEGIN');
      const insert = await dbClient.query(
        `INSERT INTO visits (
           company_id, branch_id, client_id, master_membership_id, service, materials,
           amount, discount_percent, master_payout_percent, photo_before_url, photo_after_url,
           visit_at, created_by_user_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, now()), $13)
         RETURNING id`,
        [
          req.tenant.companyId,
          branchId || req.tenant.branchId || null,
          clientId,
          resolvedMasterId,
          service,
          materials || null,
          amount,
          discountPercent || 0,
          payoutPercent,
          photoBeforeUrl || null,
          photoAfterUrl || null,
          visitAt || null,
          req.user.id,
        ]
      );
      visitId = insert.rows[0].id;

      if (Array.isArray(supplies) && supplies.length > 0) {
        const result = await applyVisitSupplies(dbClient, {
          companyId: req.tenant.companyId,
          visitId,
          userId: req.user.id,
          supplies,
        });
        if (result.error) {
          await dbClient.query('ROLLBACK');
          return res.status(400).json({ error: result.error });
        }
      }

      await dbClient.query('COMMIT');
    } catch (err) {
      await dbClient.query('ROLLBACK');
      throw err;
    } finally {
      dbClient.release();
    }

    const { rows } = await pool.query(
      `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} WHERE v.id = $1`,
      [visitId]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'visits',
      userId: req.user.id,
      entityType: 'visit',
      entityId: visitId,
      action: 'visit.created',
    });

    res.status(201).json((await attachSupplies(rows))[0]);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const existingParams = [req.params.id, req.tenant.companyId];
    let existingWhere = 'id = $1 AND company_id = $2';
    if (req.tenant.role === 'master') {
      existingParams.push(req.tenant.membershipId);
      existingWhere += ` AND master_membership_id = $${existingParams.length}`;
    }
    const existing = await pool.query(`SELECT * FROM visits WHERE ${existingWhere}`, existingParams);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Визит не найден' });
    }
    const current = existing.rows[0];

    const { clientId, service, materials, amount, discountPercent, visitAt, branchId, photoBeforeUrl, photoAfterUrl, masterMembershipId, supplies } =
      req.body;

    let masterMembershipToSet = current.master_membership_id;
    let payoutPercentToSet = current.master_payout_percent;
    if (req.tenant.role !== 'master' && masterMembershipId && masterMembershipId !== current.master_membership_id) {
      const resolved = await resolveMasterMembership(req.tenant.companyId, req.tenant, masterMembershipId);
      if (!resolved) {
        return res.status(400).json({ error: 'Мастер не найден в этой компании' });
      }
      const master = await pool.query('SELECT payout_percent FROM memberships WHERE id = $1', [resolved]);
      if (master.rows[0].payout_percent === null) {
        return res.status(400).json({ error: 'Для этого мастера не задан процент выплаты' });
      }
      masterMembershipToSet = resolved;
      payoutPercentToSet = master.rows[0].payout_percent;
    }

    if (clientId) {
      const client = await pool.query('SELECT 1 FROM clients WHERE id = $1 AND company_id = $2', [
        clientId,
        req.tenant.companyId,
      ]);
      if (client.rows.length === 0) {
        return res.status(400).json({ error: 'Клиент не найден в этой компании' });
      }
    }

    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');
      await dbClient.query(
        `UPDATE visits SET
           client_id = COALESCE($1, client_id),
           service = COALESCE($2, service),
           materials = COALESCE($3, materials),
           amount = COALESCE($4, amount),
           discount_percent = COALESCE($5, discount_percent),
           branch_id = COALESCE($6, branch_id),
           photo_before_url = COALESCE($7, photo_before_url),
           photo_after_url = COALESCE($8, photo_after_url),
           visit_at = COALESCE($9, visit_at),
           master_membership_id = $10,
           master_payout_percent = $11
         WHERE id = $12`,
        [
          clientId || null,
          service || null,
          materials !== undefined ? materials : null,
          amount === undefined || amount === null ? null : amount,
          discountPercent === undefined || discountPercent === null ? null : discountPercent,
          branchId || null,
          photoBeforeUrl !== undefined ? photoBeforeUrl : null,
          photoAfterUrl !== undefined ? photoAfterUrl : null,
          visitAt || null,
          masterMembershipToSet,
          payoutPercentToSet,
          req.params.id,
        ]
      );

      // supplies отсутствует в теле запроса — использование расходников не
      // трогаем. Пустой массив — осознанная очистка (мастер убрал все
      // отметки), тоже возвращает остаток на склад.
      if (Array.isArray(supplies)) {
        await restockVisitSupplies(dbClient, { companyId: req.tenant.companyId, visitId: req.params.id, userId: req.user.id });
        if (supplies.length > 0) {
          const result = await applyVisitSupplies(dbClient, {
            companyId: req.tenant.companyId,
            visitId: req.params.id,
            userId: req.user.id,
            supplies,
          });
          if (result.error) {
            await dbClient.query('ROLLBACK');
            return res.status(400).json({ error: result.error });
          }
        }
      }

      await dbClient.query('COMMIT');
    } catch (err) {
      await dbClient.query('ROLLBACK');
      throw err;
    } finally {
      dbClient.release();
    }

    const { rows } = await pool.query(
      `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} WHERE v.id = $1`,
      [req.params.id]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'visits',
      userId: req.user.id,
      entityType: 'visit',
      entityId: Number(req.params.id),
      action: 'visit.updated',
    });

    res.json((await attachSupplies(rows))[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const params = [req.params.id, req.tenant.companyId];
    let where = 'id = $1 AND company_id = $2';
    if (req.tenant.role === 'master') {
      params.push(req.tenant.membershipId);
      where += ` AND master_membership_id = $${params.length}`;
    }

    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');
      const exists = await dbClient.query(`SELECT id FROM visits WHERE ${where}`, params);
      if (exists.rows.length === 0) {
        await dbClient.query('ROLLBACK');
        return res.status(404).json({ error: 'Визит не найден' });
      }
      // Возвращаем на склад всё, что было списано этим визитом, прежде чем
      // удалить его — иначе расходники "терялись" бы безвозвратно.
      await restockVisitSupplies(dbClient, { companyId: req.tenant.companyId, visitId: req.params.id, userId: req.user.id });
      await dbClient.query('DELETE FROM visits WHERE id = $1', [req.params.id]);
      await dbClient.query('COMMIT');
    } catch (err) {
      await dbClient.query('ROLLBACK');
      throw err;
    } finally {
      dbClient.release();
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'visits',
      userId: req.user.id,
      entityType: 'visit',
      entityId: Number(req.params.id),
      action: 'visit.deleted',
    });
    await logAudit({
      companyId: req.tenant.companyId,
      userId: req.user.id,
      action: 'visit.deleted',
      entityType: 'visit',
      entityId: Number(req.params.id),
    });

    res.status(204).end();
  })
);

module.exports = router;
