require('dotenv').config();
const pool = require('../db/pool');
const { registerAction, clearAction } = require('../core/deadlines');
const { computeTrailingRevenue } = require('../core/taxDeadlines');
const { isSubscriptionActive } = require('../core/middleware/subscription');
const { SELF_EMPLOYED_INCOME_LIMIT_RUB } = require('../modules/roadmap/content/legalFormAdvisor');

// Запускается раз в сутки по cron (см. deploy/provision.sh) — движок
// бизнес-статуса, Фаза 1. Реестр REGISTRY ниже — не единственный на все
// времена захардкоженный триггер, а паттерн: следующий переход (ИП→ООО,
// наём первого сотрудника) добавляется новым объектом {key, evaluate,
// title}, без переделки функций main/runEvaluator/upsertTransition.

// Порог "приближается" — процент от годового лимита НПД, при котором стоит
// предупредить заранее, а не ждать самого превышения. Владелец не назвал
// конкретное число — 80% выбрано как разумный запас на реакцию (несколько
// месяцев при равномерном доходе), легко поменять одной константой здесь.
const APPROACHING_THRESHOLD_RATIO = 0.8;

// Порядок серьёзности причины триггера — по нему решаем, стоит ли повторно
// показать карточку, которую владелец уже отклонил (dismissed): только
// если причина стала СТРОГО серьёзнее прежней (например, было "доход
// приближается", стало "уже нанял сотрудника"). Просто отклонил и ничего
// не изменилось — молчим, он уже принял решение.
const REASON_SEVERITY = ['revenue_approaching', 'revenue_exceeded', 'has_employees'];

const REGISTRY = [
  {
    key: 'self_employed_to_ip',
    async evaluate(company) {
      // has_employees — жёсткое правило (ст. 4 422-ФЗ), проверяется первым и
      // не требует запроса выручки.
      if (company.has_employees) return { reason: 'has_employees' };

      // ВАЖНО: finance_entries — то, что компания сама внесла в приложении
      // (см. дисклеймер в computeTrailingRevenue), не сверено с банком.
      const revenue = await computeTrailingRevenue(company.id);
      if (revenue >= SELF_EMPLOYED_INCOME_LIMIT_RUB) return { reason: 'revenue_exceeded', revenue };
      if (revenue >= SELF_EMPLOYED_INCOME_LIMIT_RUB * APPROACHING_THRESHOLD_RATIO) return { reason: 'revenue_approaching', revenue };
      return null;
    },
    title(result) {
      if (result.reason === 'has_employees') return 'Пора перейти на ИП — самозанятому нельзя нанимать сотрудников';
      if (result.reason === 'revenue_exceeded') return 'Доход превысил лимит самозанятости — пора перейти на ИП';
      return 'Доход приближается к лимиту самозанятости — стоит подумать про ИП';
    },
  },
];

// Заводит/обновляет запись о переходе конкретной компании и возвращает её
// итоговый статус — по нему runEvaluator решает, показывать ли карточку.
// completed никогда не трогаем автоматикой (переход уже сделан руками).
async function upsertTransition(companyId, transitionKey, reason) {
  const { rows } = await pool.query(
    `SELECT status, trigger_reason FROM business_status_transitions WHERE company_id = $1 AND transition_key = $2`,
    [companyId, transitionKey]
  );
  const existing = rows[0];

  if (!existing) {
    await pool.query(
      `INSERT INTO business_status_transitions (company_id, transition_key, status, trigger_reason)
       VALUES ($1, $2, 'suggested', $3)`,
      [companyId, transitionKey, reason]
    );
    return 'suggested';
  }

  if (existing.status === 'completed') return 'completed';

  if (existing.status === 'dismissed') {
    const wasSeverity = REASON_SEVERITY.indexOf(existing.trigger_reason);
    const nowSeverity = REASON_SEVERITY.indexOf(reason);
    if (nowSeverity <= wasSeverity) return 'dismissed';
    await pool.query(
      `UPDATE business_status_transitions SET status = 'suggested', trigger_reason = $3, updated_at = now()
       WHERE company_id = $1 AND transition_key = $2`,
      [companyId, transitionKey, reason]
    );
    return 'suggested';
  }

  await pool.query(
    `UPDATE business_status_transitions SET trigger_reason = $3, updated_at = now()
     WHERE company_id = $1 AND transition_key = $2`,
    [companyId, transitionKey, reason]
  );
  return existing.status;
}

async function runEvaluator(evaluator) {
  const { rows: companies } = await pool.query(
    `SELECT id, has_employees FROM companies WHERE legal_form = 'self_employed'`
  );

  let notified = 0;
  for (const company of companies) {
    const relatedEntityType = `business_status:${evaluator.key}`;
    // Снимаем вчерашнюю карточку сразу, до всех дальнейших проверок — тот
    // же приём, что в dailyOperationsNudges.js: чистая вставка вместо
    // ON CONFLICT DO UPDATE, чтобы registerAction реально слал пуш заново.
    await clearAction({ relatedEntityType, relatedEntityId: company.id, category: 'tax' });

    // Живой триггер — только платным компаниям (§7 плана): бесплатно в
    // продукте остаётся только статичная разовая рекомендация в анонимном
    // интейке (roadmap), не персонализированный движок по реальным данным.
    if (!(await isSubscriptionActive(company.id))) continue;

    const result = await evaluator.evaluate(company);
    if (!result) continue;

    const status = await upsertTransition(company.id, evaluator.key, result.reason);
    if (status === 'dismissed' || status === 'completed') continue;

    await registerAction({
      companyId: company.id,
      category: 'tax',
      title: evaluator.title(result),
      relatedEntityType,
      relatedEntityId: company.id,
    });
    notified++;
  }
  return { total: companies.length, notified };
}

// Отдельно от триггеров переходов: компании без указанной legal_form
// (NULL) — некатегоричное разовое уведомление "уточните форму бизнеса",
// потому что без неё движок вообще не может понять, какой триггер считать.
// Тоже только платным компаниям, тем же способом.
async function nudgeUnknownLegalForm() {
  const { rows: companies } = await pool.query(`SELECT id FROM companies WHERE legal_form IS NULL`);

  let notified = 0;
  for (const company of companies) {
    await clearAction({ relatedEntityType: 'business_status:legal_form_unknown', relatedEntityId: company.id, category: 'tax' });
    if (!(await isSubscriptionActive(company.id))) continue;

    await registerAction({
      companyId: company.id,
      category: 'tax',
      title: 'Уточните форму бизнеса — самозанятый, ИП или ООО',
      relatedEntityType: 'business_status:legal_form_unknown',
      relatedEntityId: company.id,
    });
    notified++;
  }
  return { total: companies.length, notified };
}

async function main() {
  const results = {};
  for (const evaluator of REGISTRY) {
    results[evaluator.key] = await runEvaluator(evaluator);
  }
  const unknownLegalForm = await nudgeUnknownLegalForm();
  console.log(`businessStatusTriggers: ${JSON.stringify({ ...results, legal_form_unknown: unknownLegalForm })}`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('businessStatusTriggers упал:', err);
    pool.end().finally(() => process.exit(1));
  });

module.exports = { REGISTRY, upsertTransition };
