require('dotenv').config();
const pool = require('../db/pool');
const { createPayment } = require('../core/yookassa');
const { sendMail } = require('../core/mailer');
const { PAST_DUE_GRACE_DAYS } = require('../core/subscriptionGrace');
const { HARD_TRIAL_CUTOFF } = require('../core/middleware/tenancy');

// Запускается раз в сутки по cron (см. deploy/provision.sh) — списывает
// подписку с компаний, у которых закончился оплаченный период и есть
// сохранённый способ оплаты (yookassa_payment_method_id, появляется после
// первого успешного платежа через /platform/subscription/checkout).
// Идемпотентный ключ строится из company_id + даты окончания периода — если
// скрипт случайно запустится дважды за один и тот же период, повторного
// списания не будет (ЮKassa вернёт тот же результат по тому же ключу).
//
// 21.08.2026 — раньше при первой же неудаче компания уходила в past_due и
// строка выпадала из WHERE (там требовался status='active'), то есть скрипт
// НИКОГДА больше не пытался списать снова — единственная попытка, без
// повторов. Теперь past_due тоже попадает в выборку и получает повторную
// попытку каждый день, пока не истёк PAST_DUE_GRACE_DAYS от исходного
// period_end — то же окно, в которое isSubscriptionActive() ещё держит
// доступ открытым (core/middleware/subscription.js), иначе доступ закрылся
// бы раньше, чем кончились попытки списания.
async function chargeDueCompanies() {
  // owner_email — коррелированный подзапрос, а не JOIN: FROM companies c
  // остаётся один-к-одному по компании независимо от того, сколько у неё
  // записей membership с role='owner' (схема это явно не ограничивает) —
  // JOIN тут мог бы задвоить строку компании и списать её ДВАЖДЫ за один
  // проход, при списании реальных денег это недопустимый риск.
  const { rows: due } = await pool.query(
    `SELECT c.id, c.name, c.subscription_status, c.subscription_price_rub, c.yookassa_payment_method_id,
            c.subscription_current_period_end,
            (SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
             WHERE m.company_id = c.id AND m.role = 'owner' ORDER BY m.id LIMIT 1) AS owner_email
     FROM companies c
     WHERE c.subscription_status IN ('active', 'past_due')
       AND c.yookassa_payment_method_id IS NOT NULL
       AND c.subscription_current_period_end <= now()
       AND c.subscription_current_period_end > now() - make_interval(days => $1)`,
    [PAST_DUE_GRACE_DAYS]
  );

  console.log(`К списанию: ${due.length} компани${due.length === 1 ? 'я' : 'й'}`);

  for (const company of due) {
    try {
      const payment = await createPayment({
        amountRub: company.subscription_price_rub,
        description: `Продление подписки «Безопасный бизнес» — ${company.name}`,
        paymentMethodId: company.yookassa_payment_method_id,
        receiptEmail: company.owner_email,
      });

      await pool.query(
        `INSERT INTO subscription_payments (company_id, yookassa_payment_id, amount_rub, status, is_recurring_charge)
         VALUES ($1, $2, $3, $4, true)`,
        [company.id, payment.id, company.subscription_price_rub, payment.status === 'succeeded' ? 'succeeded' : 'pending']
      );

      if (payment.status === 'succeeded') {
        const nextPeriodEnd = new Date(company.subscription_current_period_end);
        nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);
        // status='active' явно возвращается сюда же — компания могла зайти в
        // этот запрос уже в past_due (повторная попытка), успешное списание
        // должно её оттуда вывести, а не оставить в "проблема с оплатой".
        await pool.query(
          `UPDATE companies SET subscription_status = 'active', subscription_current_period_end = $2 WHERE id = $1`,
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
      // в past_due (idempotent, если уже была) и уведомляем владельца, сколько
      // дней осталось до реального закрытия доступа — не отключаем молча.
      await pool.query(`UPDATE companies SET subscription_status = 'past_due' WHERE id = $1`, [company.id]);
      console.error(`❌ ${company.name}: списание не удалось —`, err.message);

      if (company.owner_email) {
        const graceEnd = new Date(company.subscription_current_period_end);
        graceEnd.setDate(graceEnd.getDate() + PAST_DUE_GRACE_DAYS);
        const daysLeft = Math.max(0, Math.ceil((graceEnd - new Date()) / 86400000));
        sendMail({
          to: company.owner_email,
          subject: 'Не удалось списать оплату за подписку «Безопасный бизнес»',
          html: `<p>Здравствуйте!</p>
<p>Не получилось продлить подписку «Безопасный бизнес» для компании «${company.name}» — банк отклонил списание ${company.subscription_price_rub} ₽.</p>
<p>Мы попробуем списать ещё раз в течение ближайших дней. Доступ к платному функционалу (скачивание отчётов и т.д.) сохранится ещё ${daysLeft} ${daysLeft === 1 ? 'день' : daysLeft >= 2 && daysLeft <= 4 ? 'дня' : 'дней'} — до ${graceEnd.toLocaleDateString('ru-RU')}.</p>
<p>Чтобы не потерять доступ, зайдите в раздел «Подписка» в приложении и обновите способ оплаты (оформите подписку заново с новой картой).</p>`,
        }).catch((mailErr) => console.error(`Не удалось отправить уведомление ${company.name}:`, mailErr.message));
      }
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
  // owner_email — тот же коррелированный подзапрос и та же причина, что и в
  // chargeDueCompanies выше (без него, для чека ЮKassa, платёж падал бы
  // "Receipt is missing", а JOIN рисковал бы задвоить списание).
  //
  // 24.08.2026 — реальный баг, замечен владельцем до того, как он успел
  // произойти: requireAiAdvisorSubscription (core/middleware/subscription.js)
  // намеренно не смотрит на статус ОСНОВНОЙ подписки — так и задумано для
  // самого доступа. Но этот скрипт списывал деньги за ИИ-советника
  // НЕЗАВИСИМО от основной подписки тоже — а после истечения триала без
  // оплаты requireTenant (core/middleware/tenancy.js) блокирует ВЕСЬ доступ
  // к платформе, включая сам виджет ИИ-ассистента. Получалось: компания
  // теряет доступ ко всему приложению, а деньги за ИИ-советника продолжают
  // списываться каждый месяц за услугу, которой физически нельзя
  // воспользоваться. Дополнительные поля (c.subscription_status,
  // c.trial_ends_at, c.created_at) — чтобы отличить именно этот случай
  // (жёсткая блокировка по истёкшему триалу) ниже, до попытки списания.
  const { rows: due } = await pool.query(
    `SELECT c.id, c.name, c.ai_advisor_subscription_price_rub AS price_rub,
            c.ai_advisor_yookassa_payment_method_id AS payment_method_id,
            c.ai_advisor_subscription_current_period_end AS period_end,
            c.subscription_status, c.trial_ends_at, c.created_at,
            (SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
             WHERE m.company_id = c.id AND m.role = 'owner' ORDER BY m.id LIMIT 1) AS owner_email
     FROM companies c
     WHERE c.ai_advisor_subscription_status = 'active'
       AND c.ai_advisor_yookassa_payment_method_id IS NOT NULL
       AND c.ai_advisor_subscription_current_period_end <= now()`
  );

  console.log(`ИИ-подписка, к списанию: ${due.length} компани${due.length === 1 ? 'я' : 'й'}`);

  for (const company of due) {
    // Основная платформа жёстко закрыта из-за истёкшего триала (та же
    // проверка, что requireTenant) — доступа к ИИ-советнику всё равно нет
    // физически, списывать не за что. Отменяем подписку вместо очередной
    // попытки оплаты — если компания вернётся и оформит основную подписку,
    // ИИ-советника нужно будет включить заново, это честнее, чем списывать
    // молча за недоступную услугу.
    const trialHardBlocked =
      company.subscription_status === 'trial' &&
      company.trial_ends_at && new Date(company.trial_ends_at) < new Date() &&
      new Date(company.created_at) >= HARD_TRIAL_CUTOFF;
    if (trialHardBlocked) {
      await pool.query(`UPDATE companies SET ai_advisor_subscription_status = 'cancelled' WHERE id = $1`, [company.id]);
      console.log(`⏹️ ${company.name} (ИИ): подписка отменена — основной доступ закрыт (истёк триал без оплаты), списывать не за что`);
      if (company.owner_email) {
        sendMail({
          to: company.owner_email,
          subject: 'Подписка «ИИ-управляющий» отменена',
          html: `<p>Здравствуйте!</p>
<p>Подписка «ИИ-управляющий» для компании «${company.name}» отменена — основной доступ к «Безопасному бизнесу» закрыт, потому что бесплатный период закончился без оплаты, и мы не стали списывать деньги за услугу, которой нельзя воспользоваться.</p>
<p>Чтобы продолжить пользоваться платформой и ИИ-советником — оформите подписку в разделе «Подписка» в приложении.</p>`,
        }).catch((mailErr) => console.error(`Не удалось отправить уведомление ${company.name}:`, mailErr.message));
      }
      continue;
    }
    try {
      const payment = await createPayment({
        amountRub: company.price_rub,
        description: `Продление подписки «ИИ-управляющий» — ${company.name}`,
        paymentMethodId: company.payment_method_id,
        receiptEmail: company.owner_email,
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
