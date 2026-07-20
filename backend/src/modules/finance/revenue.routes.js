const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { logEvent } = require('../../core/eventLog');

const router = express.Router();

// Список записей о выручке за период — обе разновидности (авто из визита и
// ручная), фронтенд помечает их бейджем "Авто · Визит №123" / "Вручную"
// (Пакет 3, Этап 1.2).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const params = [req.tenant.companyId];
    let where = 'fe.company_id = $1';
    if (req.query.dateFrom) {
      params.push(req.query.dateFrom);
      where += ` AND fe.occurred_at >= $${params.length}`;
    }
    if (req.query.dateTo) {
      params.push(req.query.dateTo);
      where += ` AND fe.occurred_at <= $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT fe.id, fe.source, fe.visit_id, fe.membership_id, u.name AS master_name,
              fe.amount, fe.comment, fe.occurred_at, fe.created_at
       FROM finance_entries fe
       LEFT JOIN memberships m ON m.id = fe.membership_id
       LEFT JOIN users u ON u.id = m.user_id
       WHERE ${where}
       ORDER BY fe.occurred_at DESC, fe.id DESC
       LIMIT 200`,
      params
    );
    res.json(rows);
  })
);

// Ручное добавление — доступно владельцу/администратору в любой момент,
// независимо от того, включён ли модуль visits_clients (мастер сотрудника
// указывать не обязан — membership_id опционален).
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { amount, membershipId, occurredAt, comment } = req.body;
    if (amount === undefined || amount === null || amount === '') {
      return res.status(400).json({ error: 'Укажите сумму выручки' });
    }
    if (membershipId) {
      const master = await pool.query(
        `SELECT 1 FROM memberships WHERE id = $1 AND company_id = $2`,
        [membershipId, req.tenant.companyId]
      );
      if (master.rows.length === 0) {
        return res.status(400).json({ error: 'Сотрудник не найден в этой компании' });
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO finance_entries (company_id, source, membership_id, amount, comment, occurred_at, created_by_user_id)
       VALUES ($1, 'manual', $2, $3, $4, COALESCE($5, CURRENT_DATE), $6)
       RETURNING id, source, visit_id, membership_id, amount, comment, occurred_at, created_at`,
      [req.tenant.companyId, membershipId || null, amount, comment || null, occurredAt || null, req.user.id]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'finance',
      userId: req.user.id,
      entityType: 'finance_entry',
      entityId: rows[0].id,
      action: 'finance_entry.created',
    });

    res.status(201).json(rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await pool.query('SELECT source FROM finance_entries WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }
    if (existing.rows[0].source === 'auto_from_visit') {
      return res.status(400).json({ error: 'Запись создана автоматически из визита — удалите визит, чтобы убрать её' });
    }
    await pool.query('DELETE FROM finance_entries WHERE id = $1 AND company_id = $2', [req.params.id, req.tenant.companyId]);

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'finance',
      userId: req.user.id,
      entityType: 'finance_entry',
      entityId: Number(req.params.id),
      action: 'finance_entry.deleted',
    });

    res.status(204).end();
  })
);

module.exports = router;
