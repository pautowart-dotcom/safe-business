require('dotenv').config();
const pool = require('../db/pool');
const { registerAction, clearAction } = require('../core/deadlines');
const { moscowDateStr } = require('../utils/moscowDate');

// Запускается раз в сутки по cron (см. deploy/provision.sh), утром по
// Москве — превращает уже включённые всем по умолчанию модули (Смена,
// Финансы, Расходники) в ежедневную привычку, а не молчаливо стоящие
// вкладки. Владелец сам решает в Настройках, какие категории уведомлений
// получать (financial/operations) — здесь только источник событий.
//
// В отличие от syncTestAction (security.routes.js — один раз предупредить
// и больше не спамить, пока не пройден тест), тут нужен ЕЖЕДНЕВНЫЙ повтор,
// пока ситуация не исправится: каждый прогон сначала снимает вчерашнюю
// запись (clearAction), потом заново создаёт при сохраняющемся условии —
// registerAction видит "чистую вставку" и шлёт пуш заново, а не молчит
// после первого раза (ON CONFLICT DO UPDATE иначе не отправлял бы повторно).
//
// Упрощение v1: снимается только следующим утренним прогоном, а не сразу
// в момент, когда владелец открыл смену/внёс выручку — раздел "Дедлайны"
// может показывать пункт ещё до конца дня после того, как он уже закрыт.
function yesterdayStr() {
  return moscowDateStr(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

async function nudgeShiftNotOpened(targetDate) {
  const { rows: companies } = await pool.query(
    `SELECT DISTINCT c.id, c.name
     FROM companies c
     JOIN company_modules cm ON cm.company_id = c.id AND cm.module_key = 'checklists' AND cm.enabled = true
     JOIN checklist_templates t ON t.company_id = c.id AND t.active = true AND t.kind = 'opening'`
  );

  for (const company of companies) {
    await clearAction({ relatedEntityType: 'shift_not_opened', relatedEntityId: company.id, category: 'operations' });

    const { rows } = await pool.query(
      `SELECT 1
       FROM checklist_marks cm
       JOIN checklist_items ci ON ci.id = cm.item_id
       JOIN checklist_templates t ON t.id = ci.template_id
       WHERE cm.company_id = $1 AND cm.mark_date = $2 AND cm.checked = true AND t.kind = 'opening'
       LIMIT 1`,
      [company.id, targetDate]
    );
    if (rows.length > 0) continue;

    await registerAction({
      companyId: company.id,
      category: 'operations',
      title: `Смена не открывалась вчера (${targetDate.slice(8, 10)}.${targetDate.slice(5, 7)})`,
      relatedEntityType: 'shift_not_opened',
      relatedEntityId: company.id,
    });
  }
  return companies.length;
}

async function nudgeRevenueNotLogged(targetDate) {
  const { rows: companies } = await pool.query(
    `SELECT c.id, c.name
     FROM companies c
     JOIN company_modules cm ON cm.company_id = c.id AND cm.module_key = 'finance' AND cm.enabled = true`
  );

  for (const company of companies) {
    await clearAction({ relatedEntityType: 'revenue_not_logged', relatedEntityId: company.id, category: 'financial' });

    const { rows } = await pool.query(
      `SELECT 1 FROM finance_entries WHERE company_id = $1 AND occurred_at = $2 LIMIT 1`,
      [company.id, targetDate]
    );
    if (rows.length > 0) continue;

    await registerAction({
      companyId: company.id,
      category: 'financial',
      title: `Вчера (${targetDate.slice(8, 10)}.${targetDate.slice(5, 7)}) не внесена выручка`,
      relatedEntityType: 'revenue_not_logged',
      relatedEntityId: company.id,
    });
  }
  return companies.length;
}

async function nudgeLowStock() {
  const { rows: companies } = await pool.query(
    `SELECT DISTINCT c.id, c.name
     FROM companies c
     JOIN company_modules cm ON cm.company_id = c.id AND cm.module_key = 'supplies' AND cm.enabled = true`
  );

  for (const company of companies) {
    await clearAction({ relatedEntityType: 'supplies_low_stock', relatedEntityId: company.id, category: 'operations' });

    const { rows } = await pool.query(
      `SELECT COUNT(*) AS n FROM supplies
       WHERE company_id = $1 AND low_stock_threshold > 0 AND quantity <= low_stock_threshold`,
      [company.id]
    );
    const n = Number(rows[0].n);
    if (n === 0) continue;

    await registerAction({
      companyId: company.id,
      category: 'operations',
      title: n === 1 ? 'Заканчивается расходник — 1 позиция' : `Заканчиваются расходники — ${n} позиции(й)`,
      relatedEntityType: 'supplies_low_stock',
      relatedEntityId: company.id,
    });
  }
  return companies.length;
}

async function main() {
  const targetDate = yesterdayStr();
  const shiftCompanies = await nudgeShiftNotOpened(targetDate);
  const revenueCompanies = await nudgeRevenueNotLogged(targetDate);
  const stockCompanies = await nudgeLowStock();
  console.log(
    `dailyOperationsNudges (${targetDate}): смена — ${shiftCompanies} компаний проверено, выручка — ${revenueCompanies}, остатки — ${stockCompanies}`
  );
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('dailyOperationsNudges упал:', err);
    pool.end().finally(() => process.exit(1));
  });
