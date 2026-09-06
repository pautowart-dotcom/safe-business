require('dotenv').config();
const pool = require('../db/pool');
const { loadProfile } = require('../modules/security/profile');
const { visiblePaidQuestions } = require('../modules/security/status');
const { sendPushToCompany } = require('../core/pushNotify');

// Уведомление о новых пунктах теста для уже вовлечённых компаний
// (06.09.2026, вопрос владельца: "как быть клиенту, который уже всё
// купил?"). Раньше при добавлении нового вопроса/нарушения в матрицу
// (например MN-405/406 или -505 в этой же сессии) компании, уже
// проходившие тест, узнавали об этом только сами, случайно открыв раздел
// заново — push никто не слал.
//
// Это НЕ реклама (не требует отдельного согласия на рассылку, в отличие от
// разовых покупателей PDF-отчёта без аккаунта — та часть сознательно НЕ
// автоматизирована, см. обсуждение 06.09.2026): уведомление о том, что в
// ИХ СОБСТВЕННОМ, уже начатом тесте появились новые пункты — тот же смысл,
// что у сервисного уведомления, а не привлечение к новой покупке.
//
// "Уже вовлечённые" — компании, у которых есть хотя бы один ответ в
// security_answers (тест начат). Компании, вообще не начинавшие тест,
// увидят все вопросы как есть при первом же прохождении — им уведомление
// не нужно.
async function run() {
  const { rows: companies } = await pool.query(
    'SELECT DISTINCT company_id FROM security_answers'
  );

  let notifiedCompanies = 0;
  for (const { company_id: companyId } of companies) {
    const profile = await loadProfile(companyId);
    if (!profile || profile.niches.length === 0) continue;

    const newCodes = [];
    for (const niche of profile.niches) {
      const visible = await visiblePaidQuestions(niche, profile);
      if (!visible || visible.length === 0) continue;
      const codes = visible.map((q) => q.code);

      const { rows: answered } = await pool.query(
        'SELECT DISTINCT question_code FROM security_answers WHERE company_id = $1 AND question_code = ANY($2)',
        [companyId, codes]
      );
      const answeredCodes = new Set(answered.map((r) => r.question_code));

      const { rows: notified } = await pool.query(
        'SELECT question_code FROM new_content_notifications WHERE company_id = $1 AND question_code = ANY($2)',
        [companyId, codes]
      );
      const notifiedCodes = new Set(notified.map((r) => r.question_code));

      for (const code of codes) {
        if (!answeredCodes.has(code) && !notifiedCodes.has(code)) newCodes.push(code);
      }
    }

    if (newCodes.length === 0) continue;

    // Побочный эффект (push) не должен блокировать запись отметки — тот же
    // принцип, что в core/deadlines.js: push best-effort, а "не спамить
    // повторно" важнее, чем гарантированная доставка одного конкретного
    // уведомления.
    await sendPushToCompany({
      companyId,
      category: 'compliance',
      title: newCodes.length === 1 ? 'В тесте появился новый пункт' : `В тесте появилось ${newCodes.length} новых пунктов`,
      body: 'Мы обновили список нарушений — стоит пройти тест ещё раз, чтобы проверить актуальность.',
      url: '/security',
    }).catch((err) => console.error('newFindingsNotifier: sendPushToCompany failed', companyId, err));

    for (const code of newCodes) {
      await pool.query(
        'INSERT INTO new_content_notifications (company_id, question_code) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [companyId, code]
      );
    }
    notifiedCompanies++;
  }

  await pool.query(
    `INSERT INTO cron_heartbeats (job_key, last_run_at, note) VALUES ('newFindingsNotifier', now(), $1)
     ON CONFLICT (job_key) DO UPDATE SET last_run_at = now(), note = $1`,
    [`проверено компаний: ${companies.length}, уведомлено: ${notifiedCompanies}`]
  );

  console.log(`newFindingsNotifier: проверено ${companies.length} компаний, уведомлено ${notifiedCompanies}`);
  await pool.end();
}

run().catch((err) => {
  console.error('newFindingsNotifier: fatal error', err);
  process.exit(1);
});
