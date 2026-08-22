const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { logEvent } = require('../../core/eventLog');
const { normalizeRuPhone } = require('../../utils/phone');
const { findMatchingClientId, countLeadsByPhone } = require('./leadMatching');

const router = express.Router();

const CLIENT_TYPES = ['individual', 'legal_entity'];
const STATUSES = ['new', 'contacted', 'ordered', 'paid'];

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Активные заявки сверху (в порядке воронки), оплаченные — внизу, как
    // "обработано" в листе ожидания (clients.routes.js) — тот же принцип:
    // не нужно листать закрытые заявки, чтобы найти новую.
    // client_name — если заявка совпала по телефону с уже существующим
    // клиентом (leadMatching.js, проставляется при создании). repeat_count —
    // сколько раз этот телефон встречался в заявках компании вообще (в т.ч.
    // текущая) — окно, а не отдельный запрос на каждую строку, чтобы не
    // делать N+1 при большом списке.
    const { rows } = await pool.query(
      `SELECT sl.id, sl.name, sl.phone, sl.client_type, sl.comment, sl.status, sl.created_at, sl.updated_at,
              sl.client_id, c.first_name AS client_first_name, c.last_name AS client_last_name,
              COUNT(*) OVER (PARTITION BY sl.phone) AS repeat_count
       FROM sales_leads sl
       LEFT JOIN clients c ON c.id = sl.client_id
       WHERE sl.company_id = $1
       ORDER BY (sl.status = 'paid') ASC, array_position(ARRAY['new','contacted','ordered','paid'], sl.status), sl.created_at DESC`,
      [req.tenant.companyId]
    );
    res.json(
      rows.map((r) => ({
        ...r,
        repeat_count: Number(r.repeat_count),
        client_name: r.client_first_name ? `${r.client_first_name} ${r.client_last_name || ''}`.trim() : null,
        client_first_name: undefined,
        client_last_name: undefined,
      }))
    );
  })
);

// CSV-выгрузка (21.08.2026, владелец: "нужно сделать выгрузку всего списка
// заявок") — до /:id-роутов ниже не мешает, они PATCH/DELETE, а не GET, но
// держим рядом с GET '/' для наглядности. text/csv, не JSON — прямое
// скачивание, а не ответ для фронта.
router.get(
  '/export.csv',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT name, phone, client_type, comment, status, created_at FROM sales_leads
       WHERE company_id = $1 ORDER BY created_at DESC`,
      [req.tenant.companyId]
    );
    const STATUS_LABELS = { new: 'Новый', contacted: 'Связались', ordered: 'Заказ', paid: 'Оплачено' };
    const CLIENT_TYPE_LABELS = { individual: 'Физлицо', legal_entity: 'Юрлицо' };
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Имя', 'Телефон', 'Тип', 'Комментарий', 'Статус', 'Дата'].map(esc).join(',');
    const lines = rows.map((r) =>
      [r.name, r.phone, CLIENT_TYPE_LABELS[r.client_type] || r.client_type, r.comment, STATUS_LABELS[r.status] || r.status, new Date(r.created_at).toLocaleDateString('ru-RU')]
        .map(esc)
        .join(',')
    );
    // ﻿ — BOM, иначе Excel на Windows показывает кириллицу кракозябрами
    // при открытии CSV напрямую (стандартная и единственная надёжная правка
    // под этот конкретный, очень частый баг).
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.send('﻿' + [header, ...lines].join('\r\n'));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, phone, clientType, comment } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Укажите имя или название клиента' });
    }
    if (clientType && !CLIENT_TYPES.includes(clientType)) {
      return res.status(400).json({ error: 'Некорректный тип клиента' });
    }
    let normalizedPhone = null;
    if (phone) {
      normalizedPhone = normalizeRuPhone(phone);
      if (!normalizedPhone) {
        return res.status(400).json({ error: 'Некорректный номер телефона' });
      }
    }
    const clientId = normalizedPhone ? await findMatchingClientId(req.tenant.companyId, normalizedPhone) : null;

    const { rows } = await pool.query(
      `INSERT INTO sales_leads (company_id, name, phone, client_type, comment, created_by_user_id, client_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, phone, client_type, comment, status, created_at, updated_at, client_id`,
      [req.tenant.companyId, name.trim(), normalizedPhone, clientType || 'individual', comment || null, req.user.id, clientId]
    );

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'leads',
      userId: req.user.id,
      entityType: 'lead',
      entityId: rows[0].id,
      action: 'lead.created',
    });

    const repeatCount = normalizedPhone ? await countLeadsByPhone(req.tenant.companyId, normalizedPhone) : 1;
    res.status(201).json({ ...rows[0], repeat_count: repeatCount });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, phone, clientType, comment, status } = req.body;
    if (clientType && !CLIENT_TYPES.includes(clientType)) {
      return res.status(400).json({ error: 'Некорректный тип клиента' });
    }
    if (status && !STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус' });
    }
    let normalizedPhone = null;
    if (phone) {
      normalizedPhone = normalizeRuPhone(phone);
      if (!normalizedPhone) {
        return res.status(400).json({ error: 'Некорректный номер телефона' });
      }
    }
    const { rows } = await pool.query(
      `UPDATE sales_leads SET
         name = COALESCE($1, name),
         phone = COALESCE($2, phone),
         client_type = COALESCE($3, client_type),
         comment = COALESCE($4, comment),
         status = COALESCE($5, status),
         updated_at = now()
       WHERE id = $6 AND company_id = $7
       RETURNING id, name, phone, client_type, comment, status, created_at, updated_at`,
      [name?.trim() || null, normalizedPhone, clientType || null, comment || null, status || null, req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }

    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'leads',
      userId: req.user.id,
      entityType: 'lead',
      entityId: rows[0].id,
      action: 'lead.updated',
    });

    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM sales_leads WHERE id = $1 AND company_id = $2', [
      req.params.id,
      req.tenant.companyId,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }
    res.status(204).end();
  })
);

module.exports = router;
