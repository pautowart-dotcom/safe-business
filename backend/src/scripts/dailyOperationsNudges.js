require('dotenv').config();
const pool = require('../db/pool');
const { registerAction, clearAction } = require('../core/deadlines');
const { moscowDateStr } = require('../utils/moscowDate');
const { computeMarginByService } = require('../modules/finance/marginAdvisor');
const { computeDiscountRepeatComparison } = require('../modules/finance/discountAdvisor');
const { computeMasterDepartureImpact } = require('../modules/finance/masterDepartureAdvisor');
const { NEW_COHORT_CUTOFF } = require('../core/cohort');
const { buildBusinessContext, hasNotableComplianceFindings } = require('../platform/ai-advisor-subscription.routes');

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
       WHERE company_id = $1 AND low_stock_threshold > 0 AND quantity <= low_stock_threshold AND archived_at IS NULL`,
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

// Тот же nudgeAiAdvisors, только для когорты "только безопасность"
// (core/cohort.js) — у неё нет finance/visits, но есть свой проактивный
// дайджест (GET /platform/ai-advisor-subscription/digest, 18.09.2026),
// который до этой правки видели только те, кто сам зашёл на экран
// "ИИ по законодательству". relatedEntityType переиспользован тот же
// ('ai_advisor_digest') — Dashboard.jsx уже умеет вести с ним на /ai-advisor
// (actionTarget), category другая ('documents', не 'financial'), поэтому
// ON CONFLICT не пересекается со строкой nudgeAiAdvisors даже для той же
// компании. Не гейтуется подпиской нарочно, тем же принципом, что и
// nudgeAiAdvisors выше — клик без подписки ведёт на тот же экран, где
// сразу видно предложение подключить (EnableAiCard), а не в тупик.
async function nudgeComplianceDigest() {
  const { rows: companies } = await pool.query(
    `SELECT DISTINCT c.id, c.name
     FROM companies c
     JOIN company_modules cm ON cm.company_id = c.id AND cm.module_key = 'security' AND cm.enabled = true
     WHERE c.created_at >= $1`,
    [NEW_COHORT_CUTOFF]
  );

  for (const company of companies) {
    await clearAction({ relatedEntityType: 'ai_advisor_digest', relatedEntityId: company.id, category: 'documents' });

    let notable = false;
    try {
      const ctx = await buildBusinessContext(company.id);
      notable = hasNotableComplianceFindings(ctx);
    } catch (err) {
      console.error(`nudgeComplianceDigest: расчёт упал для компании ${company.id}:`, err);
      continue;
    }
    if (!notable) continue;

    await registerAction({
      companyId: company.id,
      category: 'documents',
      title: 'ИИ по законодательству нашёл срочное — что сделать в первую очередь',
      relatedEntityType: 'ai_advisor_digest',
      relatedEntityId: company.id,
    });
  }
  return companies.length;
}

function pluralViolations(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'нарушение';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'нарушения';
  return 'нарушений';
}

// Разовое напоминание "на следующий день" (22.09.2026, владелец: "проходят
// тест за 5 минут и уходят") — второй, отложенный шанс достучаться до тех,
// у кого при завершении теста не сработал (или не был замечен) мгновенный
// пуш по критическому нарушению (security.routes.js, CRITICAL_RISK_THRESHOLD,
// там же — сразу в момент завершения теста, риск ≥8). Здесь — шире (любые
// открытые нарушения, не только критические) и с задержкой в сутки, когда
// уведомления в браузере уже реалистичнее успели разрешить. Срабатывает
// строго один раз на компанию — условие "зарегистрирован вчера" истинно
// только один день, отдельного снятия/повтора не нужно, в отличие от
// nudgeShiftNotOpened и соседей выше.
async function nudgeUnresolvedTestFindings(targetDate) {
  const { rows: companies } = await pool.query(
    `SELECT c.id, c.name, COUNT(v.id)::int AS open_n
     FROM companies c
     JOIN memberships m ON m.company_id = c.id AND m.role = 'owner'
     JOIN users u ON u.id = m.user_id AND u.is_guest = false
     JOIN security_violations v ON v.company_id = c.id AND v.status = 'open'
     WHERE c.created_at::date = $1::date
     GROUP BY c.id, c.name`,
    [targetDate]
  );

  for (const company of companies) {
    await registerAction({
      companyId: company.id,
      category: 'documents',
      title: `Тест нашёл ${company.open_n} ${pluralViolations(company.open_n)} — посмотрите, что нужно оформить`,
      relatedEntityType: 'test_findings_followup',
      relatedEntityId: company.id,
    });
  }
  return companies.length;
}

// Ежедневный контроль аномалий (20.09.2026, шаг 1 защиты от массового
// копирования, см. core/abuseAlerts.js): только пуш владельцу платформы, без
// автоблокировок. Нормальный фон — единицы гостей и 1-3 запуска теста на
// компанию в сутки; пороги стоят с большим запасом, срабатывание — сигнал
// посмотреть, а не доказательство.
async function watchAbuse() {
  const { sendPushToSuperAdmins } = require('../core/pushNotify');
  const guests = await pool.query(`SELECT COUNT(*) AS n FROM users WHERE is_guest = true AND created_at > now() - interval '24 hours'`);
  const heavy = await pool.query(
    `SELECT COUNT(*) AS n FROM (
       SELECT company_id FROM security_sessions WHERE started_at > now() - interval '24 hours'
       GROUP BY company_id HAVING COUNT(*) >= 8
     ) t`
  );
  const guestsN = Number(guests.rows[0].n);
  const heavyN = Number(heavy.rows[0].n);
  const lines = [];
  if (guestsN >= 100) lines.push(`гостевых аккаунтов за сутки: ${guestsN}`);
  if (heavyN >= 1) lines.push(`компаний с 8+ запусками теста за сутки: ${heavyN}`);
  if (lines.length > 0) {
    await sendPushToSuperAdmins({ title: 'Подозрительная активность', body: lines.join('; '), url: '/office/companies' });
  }
  return { guestsN, heavyN, alerted: lines.length > 0 };
}

async function main() {
  const targetDate = yesterdayStr();
  const shiftCompanies = await nudgeShiftNotOpened(targetDate);
  const revenueCompanies = await nudgeRevenueNotLogged(targetDate);
  const stockCompanies = await nudgeLowStock();
  const aiAdvisorCompanies = await nudgeAiAdvisors();
  const complianceDigestCompanies = await nudgeComplianceDigest();
  const testFindingsCompanies = await nudgeUnresolvedTestFindings(targetDate);
  try {
    const abuse = await watchAbuse();
    console.log(`watchAbuse: гостей за сутки ${abuse.guestsN}, компаний с 8+ запусками ${abuse.heavyN}, пуш ${abuse.alerted ? 'отправлен' : 'не нужен'}`);
  } catch (err) {
    // контроль аномалий не должен ронять ежедневные напоминания
    console.error('watchAbuse упал:', err);
  }
  console.log(
    `dailyOperationsNudges (${targetDate}): смена — ${shiftCompanies} компаний проверено, выручка — ${revenueCompanies}, остатки — ${stockCompanies}, ИИ-советник — ${aiAdvisorCompanies}, ИИ по законодательству — ${complianceDigestCompanies}, напоминание про находки теста — ${testFindingsCompanies}`
  );
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('dailyOperationsNudges упал:', err);
    pool.end().finally(() => process.exit(1));
  });
