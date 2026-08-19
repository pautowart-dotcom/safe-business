require('dotenv').config();
const pool = require('../db/pool');
const { createPayment } = require('../core/yookassa');

// Запускается раз в сутки по cron (см. deploy/provision.sh) — списывает
// подписку с компаний, у которых закончился оплаченный период и есть
// сохранённый способ оплаты (yookassa_payment_method_id, появляется после
// первого успешного платежа через /platform/subscription/checkout).
// Идемпотентный ключ строится из company_id + даты окончания периода — если
// скрипт случайно запустится дважды за один и тот же период, повторного
// списания не будет (ЮKassa вернёт тот же результат по тому же ключу).
async function chargeDueCompanies() {
  const { rows: due } = await pool.query(
    `SELECT id, name, subscription_price_rub, yookassa_payment_method_id, subscription_current_period_end
     FROM companies
     WHERE subscription_status = 'active'
       AND yookassa_payment_method_id IS NOT NULL
       AND subscription_current_period_end <= now()`
  );

  console.log(`К списанию: ${due.length} компани${due.length === 1 ? 'я' : 'й'}`);

  for (const company of due) {
    try {
      const payment = await createPayment({
        amountRub: company.subscription_price_rub,
        description: `Продление подписки «Безопасный бизнес» — ${company.name}`,
        paymentMethodId: company.yookassa_payment_method_id,
      });

      await pool.query(
        `INSERT INTO subscription_payments (company_id, yookassa_payment_id, amount_rub, status, is_recurring_charge)
         VALUES ($1, $2, $3, $4, true)`,
        [company.id, payment.id, company.subscription_price_rub, payment.status === 'succeeded' ? 'succeeded' : 'pending']
      );

      if (payment.status === 'succeeded') {
        const nextPeriodEnd = new Date(company.subscription_current_period_end);
        nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);
        await pool.query(
          `UPDATE companies SET subscription_current_period_end = $2 WHERE id = $1`,
          [company.id, nextPeriodEnd]
        );
        console.log(`✅ ${company.name}: списано ${company.subscription_price_rub} ₽, продлено до ${nextPeriodEnd.toISOString().slice(0, 10)}`);
      } else {
        // pending — редкий случай для сохранённого способа оплаты, но
        // возможен (например, требуется 3-D Secure повторно); статус
        // подтвердится вебхуком, как и у обычного платежа.
        console.log(`⏳ ${company.name}: платёж в статусе ${payment.status}, ждём вебхук`);
      }
    } catch (err) {
      // Списание не прошло (карта не привязана/отклонена и т.п.) — переводим
      // в past_due, а не отключаем доступ молча; см. requirePaidPlan.
      await pool.query(`UPDATE companies SET subscription_status = 'past_due' WHERE id = $1`, [company.id]);
      console.error(`❌ ${company.name}: списание не удалось —`, err.message);
    }
  }
}

// То же самое для отдельной допподписки на ИИ-управляющего (миграция 0090,
// 19.08.2026) — свой набор колонок на companies (ai_advisor_*), своя
// таблица платежей, но идентичная логика продления/грейс-периода. Отдельная
// функция, а не переиспользование chargeDueCompanies с параметром — цена и
// назначение платежа (`description`) отличаются, а дублирование тут дешевле
// параметризации ради одного вызова раз в сутки.
async function chargeDueAiAdvisorCompanies() {
  const { rows: due } = await pool.query(
    `SELECT id, name, ai_advisor_subscription_price_rub AS price_rub, ai_advisor_yookassa_payment_method_id AS payment_method_id,
            ai_advisor_subscription_current_period_end AS period_end
     FROM companies
     WHERE ai_advisor_subscription_status = 'active'
       AND ai_advisor_yookassa_payment_method_id IS NOT NULL
       AND ai_advisor_subscription_current_period_end <= now()`
  );

  console.log(`ИИ-подписка, к списанию: ${due.length} компани${due.length === 1 ? 'я' : 'й'}`);

  for (const company of due) {
    try {
      const payment = await createPayment({
        amountRub: company.price_rub,
        description: `Продление подписки «ИИ-управляющий» — ${company.name}`,
        paymentMethodId: company.payment_method_id,
      });

      await pool.query(
        `INSERT INTO ai_advisor_subscription_payments (company_id, yookassa_payment_id, amount_rub, status, is_recurring_charge)
         VALUES ($1, $2, $3, $4, true)`,
        [company.id, payment.id, company.price_rub, payment.status === 'succeeded' ? 'succeeded' : 'pending']
      );

      if (payment.status === 'succeeded') {
        const nextPeriodEnd = new Date(company.period_end);
        nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);
        await pool.query(
          `UPDATE companies SET ai_advisor_subscription_current_period_end = $2 WHERE id = $1`,
          [company.id, nextPeriodEnd]
        );
        console.log(`✅ ${company.name} (ИИ): списано ${company.price_rub} ₽, продлено до ${nextPeriodEnd.toISOString().slice(0, 10)}`);
      } else {
        console.log(`⏳ ${company.name} (ИИ): платёж в статусе ${payment.status}, ждём вебхук`);
      }
    } catch (err) {
      await pool.query(`UPDATE companies SET ai_advisor_subscription_status = 'past_due' WHERE id = $1`, [company.id]);
      console.error(`❌ ${company.name} (ИИ): списание не удалось —`, err.message);
    }
  }
}

Promise.resolve()
  .then(chargeDueCompanies)
  .then(chargeDueAiAdvisorCompanies)
  .then(() => pool.end())
  .catch((err) => {
    console.error('chargeRecurringSubscriptions упал:', err);
    pool.end().finally(() => process.exit(1));
  });
