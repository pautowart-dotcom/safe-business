const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { logEvent } = require('../core/eventLog');

const router = express.Router();
router.use(requireAuth, requireTenant);

// Владелец/админ видят все бизнес-события компании. Мастер видит только
// относящиеся к себе (membership_id = свой) и общие события без владельца
// (membership_id IS NULL, например "закрыто на праздники") — но не чужие
// личные события/смены других мастеров.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const params = [req.tenant.companyId];
    let where = 'ce.company_id = $1';

    if (req.tenant.role === 'master') {
      params.push(req.tenant.membershipId);
      where += ` AND (ce.membership_id = $${params.length} OR ce.membership_id IS NULL)`;
    }
    if (from) {
      params.push(from);
      where += ` AND ce.event_date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      where += ` AND ce.event_date <= $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT ce.id, ce.membership_id, ce.created_by_membership_id, ce.title, ce.note,
              ce.event_date, ce.event_time, ce.remind, ce.created_at,
              u.name AS member_name
       FROM calendar_events ce
       LEFT JOIN memberships m ON m.id = ce.membership_id
       LEFT JOIN users u ON u.id = m.user_id
       WHERE ${where}
       ORDER BY ce.event_date, ce.event_time NULLS LAST`,
      params
    );
    res.json(rows);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { title, note, eventDate, eventTime, remind, membershipId } = req.body;
    if (!title || !eventDate) {
      return res.status(400).json({ error: 'Укажите заголовок и дату события' });
    }

    // Мастер может создавать только свои личные напоминания — не события
    // от имени других или общие бизнес-события компании.
    let targetMembershipId = req.tenant.membershipId;
    if (req.tenant.role !== 'master') {
      targetMembershipId = membershipId || null;
      if (targetMembershipId) {
        const owner = await pool.query('SELECT 1 FROM memberships WHERE id = $1 AND company_id = $2', [
          targetMembershipId,
          req.tenant.companyId,
        ]);
        if (owner.rows.length === 0) {
          return res.status(400).json({ error: 'Участник не найден в этой компании' });
        }
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO calendar_events (company_id, membership_id, created_by_membership_id, title, note, event_date, event_time, remind)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, membership_id, created_by_membership_id, title, note, event_date, event_time, remind, created_at`,
      [req.tenant.companyId, targetMembershipId, req.tenant.membershipId, title, note || null, eventDate, eventTime || null, !!remind]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'calendar_event',
      entityId: rows[0].id,
      action: 'calendar_event.created',
    });

    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { title, note, eventDate, eventTime, remind } = req.body;

    const existingParams = [req.params.id, req.tenant.companyId];
    let existingWhere = 'id = $1 AND company_id = $2';
    // Мастер редактирует только то, что сам создал (свои напоминания) —
    // не бизнес-события, назначенные владельцем/админом.
    if (req.tenant.role === 'master') {
      existingParams.push(req.tenant.membershipId);
      existingWhere += ` AND created_by_membership_id = $${existingParams.length}`;
    }
    const existing = await pool.query(`SELECT id FROM calendar_events WHERE ${existingWhere}`, existingParams);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Событие не найдено' });
    }

    const { rows } = await pool.query(
      `UPDATE calendar_events SET
         title = COALESCE($1, title),
         note = COALESCE($2, note),
         event_date = COALESCE($3, event_date),
         event_time = COALESCE($4, event_time),
         remind = COALESCE($5, remind)
       WHERE id = $6
       RETURNING id, membership_id, created_by_membership_id, title, note, event_date, event_time, remind, created_at`,
      [title || null, note !== undefined ? note : null, eventDate || null, eventTime !== undefined ? eventTime : null, remind === undefined ? null : !!remind, req.params.id]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'calendar_event',
      entityId: rows[0].id,
      action: 'calendar_event.updated',
    });

    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const params = [req.params.id, req.tenant.companyId];
    let where = 'id = $1 AND company_id = $2';
    if (req.tenant.role === 'master') {
      params.push(req.tenant.membershipId);
      where += ` AND created_by_membership_id = $${params.length}`;
    }

    const { rowCount } = await pool.query(`DELETE FROM calendar_events WHERE ${where}`, params);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Событие не найдено' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'calendar_event',
      entityId: Number(req.params.id),
      action: 'calendar_event.deleted',
    });

    res.status(204).end();
  })
);

module.exports = router;
