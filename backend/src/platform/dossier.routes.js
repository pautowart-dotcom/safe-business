// "Сформировать досье" (Пакет 3, Этап 8): по клиенту / по дате / по мастеру
// собирает связанную историю (визиты, чек-листы, журналы, фото) в один PDF.
// Только чтение — никаких мутаций, поэтому один файл, а не отдельный модуль.
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { renderDossierPdf } = require('./dossier.pdf');

const router = express.Router();
router.use(requireAuth, requireTenant, requireRole('owner', 'admin'));

const VISIT_COLUMNS = `
  v.id, v.service, v.materials, v.amount, v.discount_percent,
  ROUND(v.amount - (v.amount * v.discount_percent / 100), 2) AS final_amount,
  v.photo_before_url, v.photo_after_url, v.visit_at,
  c.first_name AS client_first_name, c.last_name AS client_last_name,
  mu.name AS master_name
`;
const VISIT_FROM = `
  FROM visits v
  JOIN clients c ON c.id = v.client_id
  LEFT JOIN memberships mm ON mm.id = v.master_membership_id
  LEFT JOIN users mu ON mu.id = mm.user_id
`;

async function companyName(companyId) {
  const { rows } = await pool.query('SELECT name FROM companies WHERE id = $1', [companyId]);
  return rows[0]?.name || '';
}

router.get(
  '/client/:clientId/export',
  asyncHandler(async (req, res) => {
    const client = await pool.query('SELECT first_name, last_name FROM clients WHERE id = $1 AND company_id = $2', [
      req.params.clientId,
      req.tenant.companyId,
    ]);
    if (client.rows.length === 0) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    const { rows: visits } = await pool.query(
      `SELECT ${VISIT_COLUMNS} ${VISIT_FROM} WHERE v.company_id = $1 AND v.client_id = $2 ORDER BY v.visit_at DESC LIMIT 200`,
      [req.tenant.companyId, req.params.clientId]
    );

    // Чек-листы/журналы не привязаны к клиенту — досье по клиенту содержит
    // только его визиты (см. обсуждение архитектуры Этапа 8).
    const pdfBuffer = await renderDossierPdf({
      title: 'Досье клиента',
      companyName: await companyName(req.tenant.companyId),
      subtitle: `${client.rows[0].last_name} ${client.rows[0].first_name}`,
      visits,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="dossier-client.pdf"');
    res.send(pdfBuffer);
  })
);

// Раньше можно было собрать досье только за один конкретный день — не было
// способа собрать за интервал (например, за неделю проверки). from/to
// одинаковые = прежнее поведение "за один день", просто через тот же путь,
// без отдельного эндпоинта.
router.get(
  '/period/:from/:to/export',
  asyncHandler(async (req, res) => {
    const { from, to } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({ error: 'Некорректная дата (ожидается YYYY-MM-DD)' });
    }
    if (from > to) {
      return res.status(400).json({ error: '"От" не может быть позже "До"' });
    }

    const [{ rows: visits }, { rows: checklistMarks }, { rows: uvLamp }, { rows: briefing }] = await Promise.all([
      pool.query(
        `SELECT ${VISIT_COLUMNS} ${VISIT_FROM} WHERE v.company_id = $1 AND v.visit_at::date BETWEEN $2 AND $3 ORDER BY v.visit_at`,
        [req.tenant.companyId, from, to]
      ),
      pool.query(
        `SELECT cm.mark_date, ci.label, ct.name AS template_name, ct.kind, cm.checked, cm.checked_at, u.name AS membership_name
         FROM checklist_marks cm
         JOIN checklist_items ci ON ci.id = cm.item_id
         JOIN checklist_templates ct ON ct.id = ci.template_id
         LEFT JOIN memberships m ON m.id = cm.membership_id
         LEFT JOIN users u ON u.id = m.user_id
         WHERE cm.company_id = $1 AND cm.mark_date BETWEEN $2 AND $3
         ORDER BY cm.mark_date, ct.kind, ci.sort_order`,
        [req.tenant.companyId, from, to]
      ),
      pool.query(
        `SELECT e.action, e.occurred_at, u.name AS membership_name
         FROM uv_lamp_entries e
         JOIN memberships m ON m.id = e.membership_id
         LEFT JOIN users u ON u.id = m.user_id
         WHERE e.company_id = $1 AND e.occurred_at::date BETWEEN $2 AND $3
         ORDER BY e.occurred_at`,
        [req.tenant.companyId, from, to]
      ),
      pool.query(
        `SELECT e.topic, e.created_at, uc.name AS conductor_name, ur.name AS recipient_name
         FROM briefing_entries e
         JOIN memberships mc ON mc.id = e.conductor_membership_id
         LEFT JOIN users uc ON uc.id = mc.user_id
         JOIN memberships mr ON mr.id = e.recipient_membership_id
         LEFT JOIN users ur ON ur.id = mr.user_id
         WHERE e.company_id = $1 AND e.created_at::date BETWEEN $2 AND $3
         ORDER BY e.created_at`,
        [req.tenant.companyId, from, to]
      ),
    ]);

    const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    const subtitle = from === to ? fmt(from) : `${fmt(from)} — ${fmt(to)}`;

    const pdfBuffer = await renderDossierPdf({
      title: from === to ? 'Досье за дату' : 'Досье за период',
      companyName: await companyName(req.tenant.companyId),
      subtitle,
      visits,
      checklistMarks,
      journals: { uvLamp, briefing },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="dossier-period.pdf"');
    res.send(pdfBuffer);
  })
);

router.get(
  '/master/:membershipId/export',
  asyncHandler(async (req, res) => {
    const member = await pool.query(
      `SELECT u.name FROM memberships m LEFT JOIN users u ON u.id = m.user_id WHERE m.id = $1 AND m.company_id = $2`,
      [req.params.membershipId, req.tenant.companyId]
    );
    if (member.rows.length === 0) {
      return res.status(404).json({ error: 'Сотрудник не найден' });
    }

    const [{ rows: visits }, { rows: checklistMarks }, { rows: uvLamp }, { rows: briefing }] = await Promise.all([
      pool.query(
        `SELECT ${VISIT_COLUMNS} ${VISIT_FROM} WHERE v.company_id = $1 AND v.master_membership_id = $2 ORDER BY v.visit_at DESC LIMIT 200`,
        [req.tenant.companyId, req.params.membershipId]
      ),
      pool.query(
        `SELECT cm.mark_date, ci.label, ct.name AS template_name, ct.kind, cm.checked, cm.checked_at, u.name AS membership_name
         FROM checklist_marks cm
         JOIN checklist_items ci ON ci.id = cm.item_id
         JOIN checklist_templates ct ON ct.id = ci.template_id
         LEFT JOIN memberships m ON m.id = cm.membership_id
         LEFT JOIN users u ON u.id = m.user_id
         WHERE cm.company_id = $1 AND cm.membership_id = $2
         ORDER BY cm.mark_date DESC, ct.kind, ci.sort_order LIMIT 200`,
        [req.tenant.companyId, req.params.membershipId]
      ),
      pool.query(
        `SELECT e.action, e.occurred_at, u.name AS membership_name
         FROM uv_lamp_entries e
         LEFT JOIN memberships m ON m.id = e.membership_id
         LEFT JOIN users u ON u.id = m.user_id
         WHERE e.company_id = $1 AND e.membership_id = $2
         ORDER BY e.occurred_at DESC LIMIT 200`,
        [req.tenant.companyId, req.params.membershipId]
      ),
      pool.query(
        `SELECT e.topic, e.created_at, uc.name AS conductor_name, ur.name AS recipient_name
         FROM briefing_entries e
         JOIN memberships mc ON mc.id = e.conductor_membership_id
         LEFT JOIN users uc ON uc.id = mc.user_id
         JOIN memberships mr ON mr.id = e.recipient_membership_id
         LEFT JOIN users ur ON ur.id = mr.user_id
         WHERE e.company_id = $1 AND (e.conductor_membership_id = $2 OR e.recipient_membership_id = $2)
         ORDER BY e.created_at DESC LIMIT 200`,
        [req.tenant.companyId, req.params.membershipId]
      ),
    ]);

    const pdfBuffer = await renderDossierPdf({
      title: 'Досье мастера',
      companyName: await companyName(req.tenant.companyId),
      subtitle: member.rows[0].name || 'Сотрудник',
      visits,
      checklistMarks,
      journals: { uvLamp, briefing },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="dossier-master.pdf"');
    res.send(pdfBuffer);
  })
);

module.exports = router;
