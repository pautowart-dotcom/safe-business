// Пакет 4, Этап 2: вкладка "Мои сроки" внутри раздела "Безопасность" — тут
// владелец/администратор по желанию вносит конкретные даты для календаря.
// Всё опционально (см. docs/task-batch-4.txt, принцип 2): не заполнено поле —
// просто нет напоминания по нему, без блокировок.
//
// Каталог ниже — фиксированный список (не редактируется через БД, в отличие
// от journal_types): это конкретные, заранее известные пункты из задачи, а
// не пользовательский контент. Каждый пункт хранится как строка в deadlines
// с related_entity_type = `manual:<key>` — переиспользуем существующий
// upsert-движок (core/deadlines.js) вместо отдельной таблицы слотов.
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { registerDeadline, clearAction } = require('../core/deadlines');
const { TAX_REGIMES, syncTaxDeadlines } = require('../core/taxDeadlines');

const CATALOG = [
  // Кадровые
  { key: 'briefing_repeat', category: 'staff', label: 'Повторный инструктаж по охране труда — дата следующего' },
  // Помещение и оборудование
  { key: 'lease_end', category: 'premises', label: 'Договор аренды — дата окончания' },
  { key: 'fire_extinguisher', category: 'premises', label: 'Огнетушители — дата следующей перезарядки/поверки' },
  { key: 'fire_alarm_service', category: 'premises', label: 'ТО пожарной сигнализации — дата следующего' },
  { key: 'electrical_resistance', category: 'premises', label: 'Замер сопротивления изоляции электропроводки — дата следующей проверки' },
  { key: 'disinfection_contract', category: 'premises', label: 'Договор на дезинфекцию/дератизацию помещения — дата окончания' },
  // Юридические документы
  { key: 'esign', category: 'documents', label: 'Электронная подпись (ЭЦП) — дата окончания' },
  { key: 'patent_end', category: 'documents', label: 'Патент — дата окончания' },
  { key: 'license_end', category: 'documents', label: 'Лицензия — дата окончания (если применимо)' },
  { key: 'medwaste_contract', category: 'documents', label: 'Вывоз медицинских отходов класса Б — дата окончания договора' },
  { key: 'mswaste_contract', category: 'documents', label: 'Вывоз ТБО — дата окончания договора' },
];
const CATALOG_BY_KEY = Object.fromEntries(CATALOG.map((c) => [c.key, c]));

function relatedType(key) {
  return `manual:${key}`;
}

function addYears(dateStr, years) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

const router = express.Router();
// owner-only, а не owner+admin: те же данные (ЭЦП, налоги, аренда), что и
// весь раздел "Безопасность" — фронтенд уже ограничивает /security только
// владельцем (см. PrivateRoute ownerOnly, политика конфиденциальности §8.4).
router.use(requireAuth, requireTenant, requireRole('owner'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = req.tenant.companyId;

    const { rows: companyRows } = await pool.query(
      `SELECT tax_regime, to_char(ip_registered_at, 'YYYY-MM-DD') AS ip_registered_at, has_employees,
              to_char(sout_last_at, 'YYYY-MM-DD') AS sout_last_at
       FROM companies WHERE id = $1`,
      [companyId]
    );
    const company = companyRows[0] || {};

    const relatedTypes = CATALOG.map((c) => relatedType(c.key));
    const { rows: existing } = await pool.query(
      `SELECT related_entity_type, to_char(due_date, 'YYYY-MM-DD') AS due_date, recurrence, note
       FROM deadlines WHERE company_id = $1 AND related_entity_type = ANY($2)`,
      [companyId, relatedTypes]
    );
    const byType = Object.fromEntries(existing.map((r) => [r.related_entity_type, r]));

    const slots = CATALOG.map((c) => {
      const row = byType[relatedType(c.key)];
      return {
        key: c.key,
        category: c.category,
        label: c.label,
        dueDate: row?.due_date || null,
        recurrence: row?.recurrence || null,
        note: row?.note || null,
      };
    });

    res.json({
      slots,
      sout: {
        lastAt: company.sout_last_at || null,
        nextDueDate: company.sout_last_at ? addYears(company.sout_last_at, 5) : null,
      },
      tax: {
        regime: company.tax_regime || null,
        regimes: TAX_REGIMES,
        ipRegisteredAt: company.ip_registered_at || null,
        hasEmployees: company.has_employees ?? null,
      },
    });
  })
);

router.patch(
  '/slots/:key',
  asyncHandler(async (req, res) => {
    const catalogItem = CATALOG_BY_KEY[req.params.key];
    if (!catalogItem) {
      return res.status(404).json({ error: 'Неизвестный пункт' });
    }
    const { dueDate, recurrence, note } = req.body;
    if (recurrence && !['monthly', 'quarterly', 'half_year', 'yearly'].includes(recurrence)) {
      return res.status(400).json({ error: 'Недопустимая периодичность' });
    }

    if (dueDate) {
      await registerDeadline({
        companyId: req.tenant.companyId,
        category: catalogItem.category,
        title: catalogItem.label,
        dueDate,
        relatedEntityType: relatedType(catalogItem.key),
        relatedEntityId: req.tenant.companyId,
        note: note || null,
        recurrence: recurrence || null,
      });
    } else {
      // Дата очищена пользователем — убираем срок из "Дедлайнов" целиком
      // (у dedlines дата обязательна, "пустого" дедлайна не бывает).
      await clearAction({
        relatedEntityType: relatedType(catalogItem.key),
        relatedEntityId: req.tenant.companyId,
        category: catalogItem.category,
      });
    }

    res.json({ key: catalogItem.key, category: catalogItem.category, label: catalogItem.label, dueDate: dueDate || null, recurrence: recurrence || null, note: note || null });
  })
);

// СОУТ — раз в 5 лет, срок фиксирован законом (не "гадание", в отличие от
// остальных пунктов вкладки) — единственный вычисляемый пункт в кадровых.
router.patch(
  '/sout',
  asyncHandler(async (req, res) => {
    const { lastAt } = req.body;
    await pool.query('UPDATE companies SET sout_last_at = $1 WHERE id = $2', [lastAt || null, req.tenant.companyId]);

    if (lastAt) {
      const nextDueDate = addYears(lastAt, 5);
      await registerDeadline({
        companyId: req.tenant.companyId,
        category: 'staff',
        title: 'СОУТ — повторная спецоценка условий труда',
        dueDate: nextDueDate,
        relatedEntityType: 'sout',
        relatedEntityId: req.tenant.companyId,
        note: `Предыдущая СОУТ проведена: ${lastAt}`,
      });
      return res.json({ lastAt, nextDueDate });
    }

    await clearAction({ relatedEntityType: 'sout', relatedEntityId: req.tenant.companyId, category: 'staff' });
    res.json({ lastAt: null, nextDueDate: null });
  })
);

module.exports = router;
