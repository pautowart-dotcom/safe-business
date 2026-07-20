const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');

const router = express.Router();
router.use(requireAuth, requireTenant);

// Правило "12:00" (Этап 7, docs/task-batch-2.txt): до полудня блоки со
// сменой/отчётностью показывают вчерашний (полный) день, после — сегодня
// (который ещё наполняется). Общее для "Внимание сегодня", выручки,
// количества отчётов, команды.
function resolveTargetDate() {
  const now = new Date();
  const isAfterNoon = now.getHours() >= 12;
  const target = new Date(now);
  if (!isAfterNoon) target.setDate(target.getDate() - 1);
  return { date: target.toISOString().slice(0, 10), isToday: isAfterNoon };
}

const ACTION_LABELS = {
  'client.created': (p) => 'Добавлен клиент',
  'client.updated': () => 'Изменён клиент',
  'client.deleted': () => 'Удалён клиент',
  'visit.created': () => 'Добавлен визит',
  'visit.updated': () => 'Изменён визит',
  'visit.deleted': () => 'Удалён визит',
  'expense_entry.created': () => 'Добавлен расход',
  'expense_entry.updated': () => 'Изменён расход',
  'expense_entry.deleted': () => 'Удалён расход',
  'finance_adjustment.created': () => 'Добавлена корректировка выплаты',
  'supply.created': () => 'Добавлен расходник',
  'supply.received': () => 'Приход расходника на склад',
  'supply.deducted': () => 'Списан расходник',
  'checklist_item.checked': () => 'Отмечен пункт чек-листа',
  'checklist_item.unchecked': () => 'Снята отметка пункта чек-листа',
  'checklist_template.created': () => 'Добавлен чек-лист',
  'security_session.started': () => 'Начат тест безопасности',
  'security_session.completed': () => 'Завершён тест безопасности',
  'security_violation.resolved': () => 'Устранено нарушение безопасности',
  'membership.invited': () => 'Приглашён сотрудник',
  'membership.accepted': () => 'Сотрудник присоединился к команде',
  'membership.removed': () => 'Сотрудник удалён из команды',
  'feedback_message.sent': () => 'Отправлено сообщение в обратную связь',
  'calendar_event.created': () => 'Добавлено событие в календарь',
};

function humanizeEvent(row) {
  const fn = ACTION_LABELS[row.action];
  return fn ? fn(row.payload) : row.action;
}

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const { companyId, role, membershipId } = req.tenant;
    const { date: targetDate, isToday } = resolveTargetDate();

    // Активные чек-листы компании — используются и для "статуса смены"
    // (opening/closing), и для подсчёта "отчётов".
    const templates = await pool.query(
      `SELECT id, kind FROM checklist_templates WHERE company_id = $1 AND active = true`,
      [companyId]
    );
    const templateIds = templates.rows.map((t) => t.id);

    let reportsDone = 0;
    let reportsTotal = templates.rows.length;
    let byMaster = [];
    let shiftStatus = null;

    if (templateIds.length > 0) {
      const itemsRes = await pool.query(
        `SELECT template_id, COUNT(*) AS item_count FROM checklist_items WHERE template_id = ANY($1) GROUP BY template_id`,
        [templateIds]
      );
      const itemCountByTemplate = {};
      for (const r of itemsRes.rows) itemCountByTemplate[r.template_id] = Number(r.item_count);

      // "Отчёт" = чек-лист, у которого ВСЕ пункты отмечены хоть кем-то
      // (любым мастером) за целевую дату — сквозной прогресс компании,
      // не привязанный к конкретному исполнителю.
      const marksRes = await pool.query(
        `SELECT ci.template_id, cm.membership_id, COUNT(DISTINCT ci.id) AS checked_items
         FROM checklist_marks cm
         JOIN checklist_items ci ON ci.id = cm.item_id
         WHERE cm.company_id = $1 AND cm.mark_date = $2 AND cm.checked = true AND ci.template_id = ANY($3)
         GROUP BY ci.template_id, cm.membership_id`,
        [companyId, targetDate, templateIds]
      );

      const companyWideChecked = {};
      for (const r of marksRes.rows) {
        companyWideChecked[r.template_id] = (companyWideChecked[r.template_id] || 0) + Number(r.checked_items);
      }
      // companyWideChecked считает через несколько мастеров одни и те же
      // пункты дважды в редком случае пересечения — для целей общего
      // индикатора "N из M отчётов" этого достаточно, не для точного аудита.
      const fullyDoneAny = new Set();
      for (const r of marksRes.rows) {
        if (Number(r.checked_items) >= (itemCountByTemplate[r.template_id] || Infinity)) {
          fullyDoneAny.add(r.template_id);
        }
      }
      reportsDone = fullyDoneAny.size;

      const openingIds = templates.rows.filter((t) => t.kind === 'opening').map((t) => t.id);
      const closingIds = templates.rows.filter((t) => t.kind === 'closing').map((t) => t.id);
      if (openingIds.length > 0 || closingIds.length > 0) {
        if (role === 'master') {
          // Мастеру важен статус СВОЕЙ смены, а не сквозной "кто-то из
          // команды уже открыл" — иначе один мастер увидел бы смену
          // "открытой", потому что её открыл другой мастер на своей точке.
          const ownDone = (id) => {
            const row = marksRes.rows.find((r) => r.template_id === id && r.membership_id === membershipId);
            return row && Number(row.checked_items) >= (itemCountByTemplate[id] || Infinity);
          };
          const closingDone = closingIds.some(ownDone);
          const openingDone = openingIds.some(ownDone);
          shiftStatus = closingDone ? 'closed' : openingDone ? 'open' : 'not_opened';
        } else {
          const closingDone = closingIds.some((id) => fullyDoneAny.has(id));
          const openingDone = openingIds.some((id) => fullyDoneAny.has(id));
          shiftStatus = closingDone ? 'closed' : openingDone ? 'open' : 'not_opened';
        }
      }

      if (role !== 'master') {
        const masters = await pool.query(
          `SELECT m.id, u.name FROM memberships m LEFT JOIN users u ON u.id = m.user_id
           WHERE m.company_id = $1 AND m.role = 'master' AND m.user_id IS NOT NULL ORDER BY u.name`,
          [companyId]
        );
        byMaster = masters.rows.map((mstr) => {
          const done = templateIds.filter((tid) => {
            const row = marksRes.rows.find((r) => r.template_id === tid && r.membership_id === mstr.id);
            return row && Number(row.checked_items) >= (itemCountByTemplate[tid] || Infinity);
          }).length;
          return { membershipId: mstr.id, name: mstr.name, reportsDone: done, reportsTotal: templateIds.length };
        });
      } else {
        const done = templateIds.filter((tid) => {
          const row = marksRes.rows.find((r) => r.template_id === tid && r.membership_id === membershipId);
          return row && Number(row.checked_items) >= (itemCountByTemplate[tid] || Infinity);
        }).length;
        byMaster = [{ membershipId, name: null, reportsDone: done, reportsTotal: templateIds.length }];
      }
    }

    let lowStockCount = null;
    if (role !== 'master') {
      const supplies = await pool.query(
        `SELECT COUNT(*) AS n FROM supplies WHERE company_id = $1 AND quantity <= low_stock_threshold`,
        [companyId]
      );
      lowStockCount = Number(supplies.rows[0].n);
    }

    // Политика конфиденциальности §8.4: данные аудита безопасности видит
    // только владелец — админ и мастер их не получают даже в сводке дашборда.
    let securityIndexPercent = null;
    if (role === 'owner') {
      const security = await pool.query(
        `SELECT index_percent FROM security_sessions WHERE company_id = $1 AND status = 'completed'
         ORDER BY completed_at DESC LIMIT 1`,
        [companyId]
      );
      securityIndexPercent = security.rows[0]?.index_percent ?? null;
    }

    const recentEvents = await pool.query(
      `SELECT action, entity_type, payload, created_at FROM event_log WHERE company_id = $1 ORDER BY created_at DESC LIMIT 3`,
      [companyId]
    );

    res.json({
      targetDate,
      isToday,
      shiftStatus,
      reportsDone,
      reportsTotal,
      lowStockCount,
      securityIndexPercent,
      byMaster: role === 'master' ? undefined : byMaster,
      myReports: role === 'master' ? byMaster[0] : undefined,
      recentEvents: recentEvents.rows.map((r) => ({ text: humanizeEvent(r), createdAt: r.created_at })),
    });
  })
);

module.exports = router;
