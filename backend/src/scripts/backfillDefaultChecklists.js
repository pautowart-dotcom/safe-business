require('dotenv').config();
const pool = require('../db/pool');
const { ensureDefaultChecklists } = require('../core/defaultChecklist');

// Разовый (но безопасно повторяемый на каждом деплое) бэкафилл для уже
// существующих компаний (13.09.2026) — см. подробный комментарий в
// core/defaultChecklist.js про сам разрыв. Здесь закрывается ТЕКУЩАЯ база
// компаний, которые уже зарегистрировались раньше этого исправления и у
// которых модуль "Смена" включён, но чек-листа внутри него нет — именно
// они сейчас в активном триале и ближе всего к решению "платить или нет".
// Только компании с включённым модулем checklists — бессмысленно заводить
// чек-лист там, где владелец сам его выключил или где модуль скрыт когортой
// (см. core/cohort.js). is_test исключён — тестовые студии не нуждаются в
// реальном контенте.
async function run() {
  const { rows: companies } = await pool.query(
    `SELECT DISTINCT c.id
     FROM companies c
     JOIN company_modules cm ON cm.company_id = c.id AND cm.module_key = 'checklists' AND cm.enabled = true
     WHERE c.is_test = false`
  );

  let created = 0;
  for (const { id } of companies) {
    const before = await pool.query(
      `SELECT COUNT(*)::int AS n FROM checklist_templates WHERE company_id = $1 AND active = true`,
      [id]
    );
    await ensureDefaultChecklists(id);
    const after = await pool.query(
      `SELECT COUNT(*)::int AS n FROM checklist_templates WHERE company_id = $1 AND active = true`,
      [id]
    );
    if (after.rows[0].n > before.rows[0].n) created += 1;
  }

  console.log(`Бэкафилл дефолтного чек-листа: проверено компаний — ${companies.length}, получили новый чек-лист — ${created}.`);
}

run()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Ошибка бэкафилла дефолтного чек-листа:', err.message);
    pool.end().finally(() => { process.exitCode = 1; });
  });
