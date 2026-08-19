require('dotenv').config();
const pool = require('../db/pool');
const { registerAction, clearAction } = require('../core/deadlines');
const { moscowDateStr } = require('../utils/moscowDate');
const { computeMarginByService } = require('../modules/finance/marginAdvisor');
const { computeDiscountRepeatComparison } = require('../modules/finance/discountAdvisor');
const { computeMasterDepartureImpact } = require('../modules/finance/masterDepartureAdvisor');

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

// Пороги "стоит показать" — те же, что в ai-advisor-digest.routes.js
// (продублированы намеренно: этот скрипт — отдельный процесс, вызванный
// через cron, не через Express, общий модуль под три строки заводить не
// стали, тот же принцип, что у DISCOUNT_AMOUNT_SQL в summary.routes.js).
function hasNotableMargin(services) {
  return services.some((s) => s.marginPerMinute !== null && s.marginPerMinute < 0);
}
function hasNotableDiscountGap(repeatComparison) {
  const { withDiscount, withoutDiscount, minSampleSize } = repeatComparison;
  if (withDiscount.clients < minSampleSize || withoutDiscount.clients < minSampleSize) return false;
  if (withDiscount.repeatRate == null || withoutDiscount.repeatRate == null) return false;
  return withoutDiscount.repeatRate - withDiscount.repeatRate >= 10;
}
function hasNotableMasterDeparture(masters) {
  return masters.some((m) => !m.tooRecentToJudge && m.leftCount > 0);
}

// Карточка "ИИ-советник" в Центре действий (Задача 4, продолжение семьи
// советников — marginAdvisor/discountAdvisor/masterDepartureAdvisor) —
// проверяется раз в сутки тем же способом, что и остальные действия здесь:
// снять вчерашнюю запись, заново создать при сохраняющемся условии. Период
// для маржи/скидок — скользящие последние 30 дней (не календарный месяц):
// ежедневная проверка не должна зависеть от того, какое сегодня число.
// Заголовок карточки намеренно общий, без имён мастеров/сумм — подробности
// только на самом экране /ai-advisor (owner-only), карточка в Центре
// действий видна и администратору (категория 'financial', как и у
// revenue_not_logged), а данные советников чувствительнее.
async function nudgeAiAdvisors() {
  const { rows: companies } = await pool.query(
    `SELECT DISTINCT c.id, c.name
     FROM companies c
     JOIN company_modules cm ON cm.company_id = c.id AND cm.module_key = 'finance' AND cm.enabled = true`
  );

  const today = moscowDateStr();
  const from = moscowDateStr(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));

  for (const company of companies) {
    await clearAction({ relatedEntityType: 'ai_advisor_digest', relatedEntityId: company.id, category: 'financial' });

    let notable = false;
    try {
      const [marginServices, discountResult, masterDepartures] = await Promise.all([
        computeMarginByService({ companyId: company.id, from, to: today }),
        computeDiscountRepeatComparison({ companyId: company.id, from, to: today }),
        computeMasterDepartureImpact({ companyId: company.id }),
      ]);
      notable =
        hasNotableMargin(marginServices) ||
        hasNotableDiscountGap(discountResult.repeatComparison) ||
        hasNotableMasterDeparture(masterDepartures);
    } catch (err) {
      console.error(`nudgeAiAdvisors: расчёт упал для компании ${company.id}:`, err);
      continue;
    }
    if (!notable) continue;

    await registerAction({
      companyId: company.id,
      category: 'financial',
      title: 'ИИ-советник нашёл, на чём вы можете терять деньги',
      relatedEntityType: 'ai_advisor_digest',
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
  const aiAdvisorCompanies = await nudgeAiAdvisors();
  console.log(
    `dailyOperationsNudges (${targetDate}): смена — ${shiftCompanies} компаний проверено, выручка — ${revenueCompanies}, остатки — ${stockCompanies}, ИИ-советник — ${aiAdvisorCompanies}`
  );
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('dailyOperationsNudges упал:', err);
    pool.end().finally(() => process.exit(1));
  });
