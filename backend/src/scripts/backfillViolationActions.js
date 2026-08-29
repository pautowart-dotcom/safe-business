require('dotenv').config();
const pool = require('../db/pool');
const repository = require('../modules/security/content/repository');

// Разовый скрипт (29.08.2026, аудит "ведения от и до") — открытые нарушения,
// найденные ДО того, как security.routes.js начал регистрировать их как
// "действия" (см. /sessions/:id/complete), никогда не попадали в систему
// дедлайнов и, соответственно, в карточку "Критических действий" на главном
// экране владельца. Новый код покрывает только новые завершения теста —
// этот скрипт один раз досоздаёт действия для уже существующих открытых
// нарушений.
//
// Намеренно НЕ используем registerAction() из core/deadlines.js напрямую —
// она при каждой вставке шлёт push "Новый срок в Дедлайнах"; при backfill
// одной компании с 10+ нарушениями это означало бы 10+ пушей разом,
// выглядело бы как спам/баг для реального пользователя. Тот же INSERT/ON
// CONFLICT, что и внутри registerAction, но без побочного эффекта пуша.
// Идемпотентно, безопасно запускать повторно.
async function run() {
  const { rows } = await pool.query(
    `SELECT id, company_id, violation_code, niche FROM security_violations WHERE status = 'open'`
  );

  const matrixCache = {};
  let registered = 0;
  for (const row of rows) {
    if (!(row.niche in matrixCache)) matrixCache[row.niche] = await repository.getViolationMatrix(row.niche);
    const details = matrixCache[row.niche]?.find((v) => v.code === row.violation_code);
    await pool.query(
      `INSERT INTO deadlines (company_id, category, title, due_date, kind, related_entity_type, related_entity_id)
       VALUES ($1, 'documents', $2, NULL, 'action', 'security_violation', $3)
       ON CONFLICT (related_entity_type, related_entity_id, category) WHERE related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL
       DO UPDATE SET title = EXCLUDED.title, kind = 'action', due_date = NULL, status = 'pending'`,
      [row.company_id, details?.title || row.violation_code, row.id]
    );
    registered += 1;
  }

  console.log(`Действия зарегистрированы для ${registered} открытых нарушений (из ${rows.length} найденных), без пуш-уведомлений.`);
  await pool.end();
}

run().catch((err) => {
  console.error('Не удалось выполнить backfill:', err);
  process.exit(1);
});
