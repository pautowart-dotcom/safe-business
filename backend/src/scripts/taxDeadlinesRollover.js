require('dotenv').config();
const pool = require('../db/pool');
const { syncTaxDeadlines, syncEmployerMonthly, currentTaxYear } = require('../core/taxDeadlines');
const { sendPushToCompany } = require('../core/pushNotify');

// Налоговые сроки нового года (14.10.2026, В1а плана этапа 2). Раньше сроки
// заводились только при сохранении налоговых настроек — с 1 января у всех,
// кто настроил их в прошлом году, новых сроков не было, пока владелец сам
// не зайдёт в настройки. Запускается раз в сутки (deploy/provision.sh).
//
// Трогаем только компании, у которых за текущий год нет ни одного
// налогового срока: повторный sync сбрасывал бы отметку «Готово»
// (registerDeadline при обновлении ставит status = 'pending'). Сроки
// прошлого года не трогаем — у них свой ключ с годом (миграция 0129).
// И только тех, у кого были сроки за прошлый год, — это перенос на новый
// год, а не первая настройка: посреди года первая настройка завела бы
// уже просроченные авансы прошедших кварталов.
async function run() {
  const year = currentTaxYear();

  const { rows: companies } = await pool.query(
    `SELECT c.id, c.tax_regime, to_char(c.ip_registered_at, 'YYYY-MM-DD') AS ip_registered_at, c.has_employees
     FROM companies c
     WHERE (c.tax_regime IS NOT NULL OR c.has_employees)
       AND NOT EXISTS (
         SELECT 1 FROM deadlines d
         WHERE d.company_id = c.id AND d.category = 'tax' AND d.related_entity_type LIKE $1
       )
       AND EXISTS (
         SELECT 1 FROM deadlines d
         WHERE d.company_id = c.id AND d.category = 'tax' AND d.related_entity_type LIKE $2
       )`,
    [`tax:${year}:%`, `tax:${year - 1}:%`]
  );

  let rolled = 0;
  for (const c of companies) {
    const count = await syncTaxDeadlines(
      c.id,
      c.tax_regime,
      { ipRegisteredAt: c.ip_registered_at, hasEmployees: c.has_employees },
      { year, notify: false }
    );
    if (count === 0) continue; // самозанятость: сроков нет, это нормально
    rolled++;
    await sendPushToCompany({
      companyId: c.id,
      category: 'tax',
      title: `Налоговые сроки на ${year} год добавлены`,
      body: 'Напомним заранее о каждом — список в «Дедлайнах»',
      url: '/deadlines',
    }).catch((err) => console.error('taxDeadlinesRollover: sendPushToCompany failed', c.id, err));
  }

  // Ежемесячные дела работодателя (В2а) — у компаний, которые отметили
  // сотрудников до появления этих сроков. syncEmployerMonthly не трогает уже
  // заведённые, так что ежедневный прогон безопасен. Без push: два срока
  // просто появляются в списке.
  const { rows: employers } = await pool.query(
    `SELECT c.id FROM companies c
     WHERE c.has_employees
       AND NOT EXISTS (
         SELECT 1 FROM deadlines d WHERE d.company_id = c.id AND d.related_entity_type = 'tax:emp_monthly_main'
       )`
  );
  for (const e of employers) await syncEmployerMonthly(e.id, true, false);

  await pool.query(
    `INSERT INTO cron_heartbeats (job_key, last_run_at, note) VALUES ('taxDeadlinesRollover', now(), $1)
     ON CONFLICT (job_key) DO UPDATE SET last_run_at = now(), note = $1`,
    [`год ${year}: проверено ${companies.length}, добавлены сроки ${rolled}; ежемесячные работодателя — ${employers.length}`]
  );

  console.log(`taxDeadlinesRollover: год ${year}, без сроков ${companies.length}, добавлены ${rolled}; ежемесячные работодателя — ${employers.length}`);
  await pool.end();
}

run().catch((err) => {
  console.error('taxDeadlinesRollover: fatal error', err);
  process.exit(1);
});
