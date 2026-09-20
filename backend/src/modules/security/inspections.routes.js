const express = require('express');
const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../core/middleware/role');
const { encrypt, decrypt } = require('../../core/crypto');
const { logEvent } = require('../../core/eventLog');
const { registerDeadline, clearAction } = require('../../core/deadlines');

const router = express.Router();

// История проверок (19.09.2026, идея владельца) — та же граница, что у всего
// модуля "Безопасность" (owner-only, политика конфиденциальности §8.4):
// сведения о проверках компании не менее чувствительны, чем результаты
// теста.
router.use(requireRole('owner'));

const AUTHORITIES = ['rospotrebnadzor', 'fire_inspection', 'labor_inspection', 'roskomnadzor', 'tax_inspection', 'other'];
const AUTHORITY_LABELS = {
  rospotrebnadzor: 'Роспотребнадзор',
  fire_inspection: 'Пожарный надзор (МЧС)',
  labor_inspection: 'Инспекция труда',
  roskomnadzor: 'Роскомнадзор',
  tax_inspection: 'Налоговая (ФНС)',
  other: 'Другой орган',
};
const KINDS = ['planned', 'unplanned', 'unknown'];
// Фиксированный список, не свободный текст — чтобы области можно было
// сравнивать между компаниями, когда (и если) появится согласованная
// обезличенная аналитика.
const INSPECTION_AREAS = ['sanitary', 'fire', 'personal_data', 'labor', 'tax_cash', 'consumer_rights', 'licenses_waste', 'other'];
const OUTCOMES = ['no_findings', 'remarks_fixed', 'order', 'protocol', 'suspension'];

const ORDER_DEADLINE_TYPE = 'inspection_order';

function isValidDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function toRow(r) {
  return {
    id: r.id,
    inspectedOn: r.inspected_on,
    authority: r.authority,
    authorityLabel: AUTHORITY_LABELS[r.authority] || r.authority,
    kind: r.kind,
    areas: r.areas,
    outcome: r.outcome,
    fineAmount: r.fine_amount === null ? null : Number(r.fine_amount),
    fixDueDate: r.fix_due_date,
    details: r.details_enc ? decrypt(r.details_enc) : '',
    createdAt: r.created_at,
  };
}

// Общая проверка тела запроса для POST и PATCH — возвращает { error } или
// { value } с уже нормализованными полями. partial=true (PATCH) не требует
// обязательных полей, только проверяет те, что реально пришли.
function validateBody(body, { partial }) {
  const out = {};

  if (body.inspectedOn !== undefined || !partial) {
    if (!isValidDate(body.inspectedOn)) return { error: 'Укажите дату проверки' };
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (new Date(`${body.inspectedOn}T00:00:00Z`) > tomorrow) return { error: 'Дата проверки не может быть в будущем' };
    out.inspectedOn = body.inspectedOn;
  }
  if (body.authority !== undefined || !partial) {
    if (!AUTHORITIES.includes(body.authority)) return { error: 'Выберите орган, который проводил проверку' };
    out.authority = body.authority;
  }
  if (body.kind !== undefined) {
    if (!KINDS.includes(body.kind)) return { error: 'Некорректный вид проверки' };
    out.kind = body.kind;
  }
  if (body.areas !== undefined) {
    if (!Array.isArray(body.areas) || body.areas.some((a) => !INSPECTION_AREAS.includes(a))) return { error: 'Некорректный список областей проверки' };
    out.areas = [...new Set(body.areas)];
  }
  if (body.outcome !== undefined || !partial) {
    if (!OUTCOMES.includes(body.outcome)) return { error: 'Выберите итог проверки' };
    out.outcome = body.outcome;
  }
  if (body.fineAmount !== undefined) {
    if (body.fineAmount === null || body.fineAmount === '') {
      out.fineAmount = null;
    } else {
      const n = Number(body.fineAmount);
      if (!Number.isFinite(n) || n < 0 || n > 1e9) return { error: 'Некорректная сумма штрафа' };
      out.fineAmount = n;
    }
  }
  if (body.fixDueDate !== undefined) {
    if (body.fixDueDate === null || body.fixDueDate === '') {
      out.fixDueDate = null;
    } else if (!isValidDate(body.fixDueDate)) {
      return { error: 'Некорректный срок исправления' };
    } else {
      out.fixDueDate = body.fixDueDate;
    }
  }
  if (body.details !== undefined) {
    if (typeof body.details !== 'string' || body.details.length > 4000) return { error: 'Заметка слишком длинная (до 4000 символов)' };
    out.details = body.details.trim();
  }
  return { value: out };
}

// Срок исправления по предписанию — обычный дедлайн компании (категория
// 'documents', как и остальные пункты про документы/проверки): попадает в
// "Дедлайны"/Центр действий и получает напоминания на общих основаниях,
// вместо того чтобы жить только в этой вкладке. Один дедлайн на проверку
// (related_entity_id = inspections.id) — повторный вызов обновляет, не
// дублирует. Снимаем, если итог перестал быть "предписание" или срока нет.
async function syncOrderDeadline(companyId, row) {
  if (row.outcome === 'order' && row.fix_due_date) {
    await registerDeadline({
      companyId,
      category: 'documents',
      title: `Срок по предписанию — ${AUTHORITY_LABELS[row.authority] || 'проверка'}`,
      dueDate: row.fix_due_date,
      relatedEntityType: ORDER_DEADLINE_TYPE,
      relatedEntityId: row.id,
    });
  } else {
    await clearAction({ relatedEntityType: ORDER_DEADLINE_TYPE, relatedEntityId: row.id, category: 'documents' });
  }
}

router.get(
  '/inspections',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, to_char(inspected_on, 'YYYY-MM-DD') AS inspected_on, authority, kind, areas, outcome, fine_amount,
              to_char(fix_due_date, 'YYYY-MM-DD') AS fix_due_date, details_enc, created_at
       FROM inspections WHERE company_id = $1 ORDER BY inspected_on DESC, id DESC`,
      [req.tenant.companyId]
    );
    res.json(rows.map(toRow));
  })
);

router.post(
  '/inspections',
  asyncHandler(async (req, res) => {
    const { error, value } = validateBody(req.body || {}, { partial: false });
    if (error) return res.status(400).json({ error });
    if (value.fixDueDate && value.fixDueDate < value.inspectedOn) {
      return res.status(400).json({ error: 'Срок исправления не может быть раньше даты проверки' });
    }

    const { rows } = await pool.query(
      `INSERT INTO inspections (company_id, inspected_on, authority, kind, areas, outcome, fine_amount, fix_due_date, details_enc, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, to_char(inspected_on, 'YYYY-MM-DD') AS inspected_on, authority, kind, areas, outcome, fine_amount,
                 to_char(fix_due_date, 'YYYY-MM-DD') AS fix_due_date, details_enc, created_at`,
      [
        req.tenant.companyId, value.inspectedOn, value.authority, value.kind || 'unknown', value.areas || [], value.outcome,
        value.fineAmount ?? null, value.fixDueDate || null, value.details ? encrypt(value.details) : null, req.user.id,
      ]
    );
    await syncOrderDeadline(req.tenant.companyId, rows[0]);
    await logEvent({
      companyId: req.tenant.companyId,
      moduleKey: 'security',
      userId: req.user.id,
      entityType: 'inspection',
      entityId: rows[0].id,
      action: 'inspection.created',
    });
    res.status(201).json(toRow(rows[0]));
  })
);

router.patch(
  '/inspections/:id',
  asyncHandler(async (req, res) => {
    const { error, value } = validateBody(req.body || {}, { partial: true });
    if (error) return res.status(400).json({ error });

    const currentRes = await pool.query(
      `SELECT id, to_char(inspected_on, 'YYYY-MM-DD') AS inspected_on, to_char(fix_due_date, 'YYYY-MM-DD') AS fix_due_date
       FROM inspections WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.tenant.companyId]
    );
    if (currentRes.rows.length === 0) return res.status(404).json({ error: 'Проверка не найдена' });
    const current = currentRes.rows[0];

    const effectiveInspectedOn = value.inspectedOn || current.inspected_on;
    const effectiveFixDue = 'fixDueDate' in value ? value.fixDueDate : current.fix_due_date;
    if (effectiveFixDue && effectiveFixDue < effectiveInspectedOn) {
      return res.status(400).json({ error: 'Срок исправления не может быть раньше даты проверки' });
    }

    // Поле обновляется, только если реально пришло (null тоже валидное
    // значение — очистить сумму/срок/заметку), тот же приём, что в
    // supplies.routes.js PATCH.
    const has = (k) => k in value;
    const { rows } = await pool.query(
      `UPDATE inspections SET
         inspected_on = CASE WHEN $3 THEN $4 ELSE inspected_on END,
         authority = CASE WHEN $5 THEN $6 ELSE authority END,
         kind = CASE WHEN $7 THEN $8 ELSE kind END,
         areas = CASE WHEN $9 THEN $10 ELSE areas END,
         outcome = CASE WHEN $11 THEN $12 ELSE outcome END,
         fine_amount = CASE WHEN $13 THEN $14 ELSE fine_amount END,
         fix_due_date = CASE WHEN $15 THEN $16 ELSE fix_due_date END,
         details_enc = CASE WHEN $17 THEN $18 ELSE details_enc END,
         updated_at = now()
       WHERE id = $1 AND company_id = $2
       RETURNING id, to_char(inspected_on, 'YYYY-MM-DD') AS inspected_on, authority, kind, areas, outcome, fine_amount,
                 to_char(fix_due_date, 'YYYY-MM-DD') AS fix_due_date, details_enc, created_at`,
      [
        req.params.id, req.tenant.companyId,
        has('inspectedOn'), value.inspectedOn ?? null,
        has('authority'), value.authority ?? null,
        has('kind'), value.kind ?? null,
        has('areas'), value.areas ?? null,
        has('outcome'), value.outcome ?? null,
        has('fineAmount'), value.fineAmount ?? null,
        has('fixDueDate'), value.fixDueDate ?? null,
        has('details'), value.details ? encrypt(value.details) : null,
      ]
    );
    await syncOrderDeadline(req.tenant.companyId, rows[0]);
    res.json(toRow(rows[0]));
  })
);

router.delete(
  '/inspections/:id',
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM inspections WHERE id = $1 AND company_id = $2', [req.params.id, req.tenant.companyId]);
    if (rowCount === 0) return res.status(404).json({ error: 'Проверка не найдена' });
    await clearAction({ relatedEntityType: ORDER_DEADLINE_TYPE, relatedEntityId: Number(req.params.id), category: 'documents' });
    res.status(204).end();
  })
);

module.exports = router;
module.exports.AUTHORITY_LABELS = AUTHORITY_LABELS;
