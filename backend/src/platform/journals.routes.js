const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { logEvent } = require('../core/eventLog');
const { renderJournalPdf } = require('./journals.pdf');

const router = express.Router();
router.use(requireAuth, requireTenant);

// "Структура" журналов (заголовок + обязательный дисклеймер) — читается из
// БД, редактируется через админку Super Admin (admin.routes.js), см.
// migrations/0031_journals.sql.
router.get(
  '/types',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT key, title, disclaimer FROM journal_types ORDER BY key');
    res.json(rows);
  })
);

async function journalType(key) {
  const { rows } = await pool.query('SELECT title, disclaimer FROM journal_types WHERE key = $1', [key]);
  return rows[0];
}

async function companyName(companyId) {
  const { rows } = await pool.query('SELECT name FROM companies WHERE id = $1', [companyId]);
  return rows[0]?.name || '';
}

// --- Журнал УФ-бактерицидной установки ---
// Заполнять во время смены может любой сотрудник компании, поэтому список/
// создание не гейтятся ролью (в отличие от экспорта в PDF ниже).
router.get(
  '/uv-lamp',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT e.id, e.action, e.membership_id, u.name AS membership_name, e.occurred_at, e.created_at
       FROM uv_lamp_entries e
       JOIN memberships m ON m.id = e.membership_id
       LEFT JOIN users u ON u.id = m.user_id
       WHERE e.company_id = $1
       ORDER BY e.occurred_at DESC`,
      [req.tenant.companyId]
    );
    res.json(rows);
  })
);

router.post(
  '/uv-lamp',
  asyncHandler(async (req, res) => {
    const { action, membershipId, occurredAt } = req.body;
    if (!['on', 'off'].includes(action) || !membershipId) {
      return res.status(400).json({ error: 'Укажите действие (включил/выключил) и ответственного' });
    }

    const member = await pool.query('SELECT 1 FROM memberships WHERE id = $1 AND company_id = $2', [
      membershipId,
      req.tenant.companyId,
    ]);
    if (member.rows.length === 0) {
      return res.status(400).json({ error: 'Сотрудник не найден в этой компании' });
    }

    const { rows } = await pool.query(
      `INSERT INTO uv_lamp_entries (company_id, action, membership_id, occurred_at, created_by_user_id)
       VALUES ($1, $2, $3, COALESCE($4, now()), $5)
       RETURNING id, action, membership_id, occurred_at, created_at`,
      [req.tenant.companyId, action, membershipId, occurredAt || null, req.user.id]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'uv_lamp_entry',
      entityId: rows[0].id,
      action: 'uv_lamp_entry.created',
    });

    res.status(201).json(rows[0]);
  })
);

router.get(
  '/uv-lamp/export',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT e.action, u.name AS membership_name, e.occurred_at
       FROM uv_lamp_entries e
       JOIN memberships m ON m.id = e.membership_id
       LEFT JOIN users u ON u.id = m.user_id
       WHERE e.company_id = $1
       ORDER BY e.occurred_at DESC`,
      [req.tenant.companyId]
    );
    const type = await journalType('uv_lamp');
    const pdfBuffer = await renderJournalPdf({
      companyName: await companyName(req.tenant.companyId),
      title: type.title,
      disclaimer: type.disclaimer,
      columns: [
        { header: 'Действие', key: 'action' },
        { header: 'Ответственный', key: 'membership_name' },
        { header: 'Время', key: 'occurred_at' },
      ],
      rows: rows.map((r) => ({
        action: r.action === 'on' ? 'Включил' : 'Выключил',
        membership_name: r.membership_name || 'Сотрудник',
        occurred_at: new Date(r.occurred_at).toLocaleString('ru-RU'),
      })),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="uv-lamp-journal.pdf"');
    res.send(pdfBuffer);
  })
);

// --- Журнал инструктажа на рабочем месте ---
// Разовое событие: кто провёл + кто получил, оба подтверждают отдельно
// (без эл. подписи — просто отметка времени по клику "Подтверждаю").
router.get(
  '/briefing',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT e.id, e.topic,
              e.conductor_membership_id, uc.name AS conductor_name, e.conductor_confirmed_at,
              e.recipient_membership_id, ur.name AS recipient_name, e.recipient_confirmed_at,
              e.created_at
       FROM briefing_entries e
       JOIN memberships mc ON mc.id = e.conductor_membership_id
       LEFT JOIN users uc ON uc.id = mc.user_id
       JOIN memberships mr ON mr.id = e.recipient_membership_id
       LEFT JOIN users ur ON ur.id = mr.user_id
       WHERE e.company_id = $1
       ORDER BY e.created_at DESC`,
      [req.tenant.companyId]
    );
    // youAreConductor/youAreRecipient — считаем на бэкенде (req.tenant.membershipId
    // авторитетный, фронтенду сейчас неоткуда узнать свой membershipId), чтобы
    // страница журнала могла показать кнопку "Подтверждаю" только нужной стороне.
    const withSelf = rows.map((r) => ({
      ...r,
      you_are_conductor: r.conductor_membership_id === req.tenant.membershipId,
      you_are_recipient: r.recipient_membership_id === req.tenant.membershipId,
    }));
    res.json(withSelf);
  })
);

router.post(
  '/briefing',
  asyncHandler(async (req, res) => {
    const { conductorMembershipId, recipientMembershipId, topic } = req.body;
    if (!conductorMembershipId || !recipientMembershipId) {
      return res.status(400).json({ error: 'Укажите, кто провёл инструктаж и кто его получил' });
    }
    if (conductorMembershipId === recipientMembershipId) {
      return res.status(400).json({ error: 'Проводящий и получатель должны быть разными сотрудниками' });
    }

    const members = await pool.query(
      'SELECT id FROM memberships WHERE id = ANY($1) AND company_id = $2',
      [[conductorMembershipId, recipientMembershipId], req.tenant.companyId]
    );
    if (members.rows.length !== 2) {
      return res.status(400).json({ error: 'Сотрудник не найден в этой компании' });
    }

    const { rows } = await pool.query(
      `INSERT INTO briefing_entries (company_id, conductor_membership_id, recipient_membership_id, topic, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, conductor_membership_id, recipient_membership_id, topic, conductor_confirmed_at, recipient_confirmed_at, created_at`,
      [req.tenant.companyId, conductorMembershipId, recipientMembershipId, topic || null, req.user.id]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'briefing_entry',
      entityId: rows[0].id,
      action: 'briefing_entry.created',
    });

    res.status(201).json(rows[0]);
  })
);

// Подтверждение — только за самого себя: сверяем, что membership_id текущей
// сессии совпадает со стороной (проводящий/получатель) этой записи. Кто не
// участвует в записи — подтвердить её не может, даже владелец.
router.patch(
  '/briefing/:id/confirm',
  asyncHandler(async (req, res) => {
    const { rows: existingRows } = await pool.query(
      'SELECT conductor_membership_id, recipient_membership_id FROM briefing_entries WHERE id = $1 AND company_id = $2',
      [req.params.id, req.tenant.companyId]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }
    const entry = existingRows[0];
    const membershipId = req.tenant.membershipId;

    let column;
    if (membershipId && entry.conductor_membership_id === membershipId) {
      column = 'conductor_confirmed_at';
    } else if (membershipId && entry.recipient_membership_id === membershipId) {
      column = 'recipient_confirmed_at';
    } else {
      return res.status(403).json({ error: 'Подтвердить может только участник инструктажа (проводящий или получатель)' });
    }

    const { rows } = await pool.query(
      `UPDATE briefing_entries SET ${column} = COALESCE(${column}, now())
       WHERE id = $1
       RETURNING id, conductor_membership_id, recipient_membership_id, topic, conductor_confirmed_at, recipient_confirmed_at, created_at`,
      [req.params.id]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'platform',
      userId: req.user.id,
      entityType: 'briefing_entry',
      entityId: rows[0].id,
      action: 'briefing_entry.confirmed',
    });

    res.json(rows[0]);
  })
);

router.get(
  '/briefing/export',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT e.topic,
              uc.name AS conductor_name, e.conductor_confirmed_at,
              ur.name AS recipient_name, e.recipient_confirmed_at,
              e.created_at
       FROM briefing_entries e
       JOIN memberships mc ON mc.id = e.conductor_membership_id
       LEFT JOIN users uc ON uc.id = mc.user_id
       JOIN memberships mr ON mr.id = e.recipient_membership_id
       LEFT JOIN users ur ON ur.id = mr.user_id
       WHERE e.company_id = $1
       ORDER BY e.created_at DESC`,
      [req.tenant.companyId]
    );
    const type = await journalType('briefing');
    const pdfBuffer = await renderJournalPdf({
      companyName: await companyName(req.tenant.companyId),
      title: type.title,
      disclaimer: type.disclaimer,
      columns: [
        { header: 'Тема', key: 'topic' },
        { header: 'Провёл', key: 'conductor' },
        { header: 'Получил', key: 'recipient' },
        { header: 'Дата', key: 'created_at' },
      ],
      rows: rows.map((r) => ({
        topic: r.topic || 'Инструктаж на рабочем месте',
        conductor: `${r.conductor_name || 'Сотрудник'}${r.conductor_confirmed_at ? ' ✓ ' + new Date(r.conductor_confirmed_at).toLocaleString('ru-RU') : ' (не подтверждено)'}`,
        recipient: `${r.recipient_name || 'Сотрудник'}${r.recipient_confirmed_at ? ' ✓ ' + new Date(r.recipient_confirmed_at).toLocaleString('ru-RU') : ' (не подтверждено)'}`,
        created_at: new Date(r.created_at).toLocaleDateString('ru-RU'),
      })),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="briefing-journal.pdf"');
    res.send(pdfBuffer);
  })
);

// --- Журнал дезсредств (Пакет 3, Этап 6) ---
// Никакого ручного ввода: журнал — это просто история списаний/приходов
// позиций склада, помеченных тегом "дезинфицирующее средство"
// (supplies.is_disinfectant), читаемая из уже существующего
// supply_movements. Записи создаются через модуль "Расходники"
// (Пришло/Списать/визит), не здесь — поэтому только GET + экспорт.
router.get(
  '/disinfectant-log',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT sm.id, sm.type, sm.quantity, sm.created_at, s.name AS supply_name, s.unit, u.name AS user_name
       FROM supply_movements sm
       JOIN supplies s ON s.id = sm.supply_id
       LEFT JOIN users u ON u.id = sm.created_by_user_id
       WHERE sm.company_id = $1 AND s.is_disinfectant = true
       ORDER BY sm.created_at DESC`,
      [req.tenant.companyId]
    );
    res.json(rows);
  })
);

router.get(
  '/disinfectant-log/export',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT sm.type, sm.quantity, sm.created_at, s.name AS supply_name, s.unit, u.name AS user_name
       FROM supply_movements sm
       JOIN supplies s ON s.id = sm.supply_id
       LEFT JOIN users u ON u.id = sm.created_by_user_id
       WHERE sm.company_id = $1 AND s.is_disinfectant = true
       ORDER BY sm.created_at DESC`,
      [req.tenant.companyId]
    );
    const type = await journalType('disinfectant_log');
    const pdfBuffer = await renderJournalPdf({
      companyName: await companyName(req.tenant.companyId),
      title: type.title,
      disclaimer: type.disclaimer,
      columns: [
        { header: 'Операция', key: 'op' },
        { header: 'Средство', key: 'supply_name' },
        { header: 'Количество', key: 'qty' },
        { header: 'Кто', key: 'user_name' },
        { header: 'Время', key: 'created_at' },
      ],
      rows: rows.map((r) => ({
        op: r.type === 'in' ? 'Приход' : 'Списание',
        supply_name: r.supply_name,
        qty: `${Number(r.quantity)} ${r.unit || ''}`.trim(),
        user_name: r.user_name || '—',
        created_at: new Date(r.created_at).toLocaleString('ru-RU'),
      })),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="disinfectant-journal.pdf"');
    res.send(pdfBuffer);
  })
);

module.exports = router;
