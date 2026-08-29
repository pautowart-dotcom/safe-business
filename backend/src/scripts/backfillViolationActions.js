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
// Тот же порог, что и в security.routes.js (/sessions/:id/complete) — только
// risk >= 8 попадает в "Критические действия", иначе карточка на главном
// экране была бы красной практически всегда (см. комментарий там).
const CRITICAL_RISK_THRESHOLD = 8;

async function run() {
  const { rows } = await pool.query(
    `SELECT id, company_id, violation_code, niche FROM security_violations WHERE status = 'open'`
  );

  const matrixCache = {};
  let registered = 0;
  let skippedLowRisk = 0;
  for (const row of rows) {
    if (!(row.niche in matrixCache)) matrixCache[row.niche] = await repository.getViolationMatrix(row.niche);
    const details = matrixCache[row.niche]?.find((v) => v.code === row.violation_code);
    if (!details || details.risk < CRITICAL_RISK_THRESHOLD) {
      skippedLowRisk += 1;
      continue;
    }
    await pool.query(
      `INSERT INTO deadlines (company_id, category, title, due_date, kind, related_entity_type, related_entity_id)
       VALUES ($1, 'documents', $2, NULL, 'action', 'security_violation', $3)
       ON CONFLICT (related_entity_type, related_entity_id, category) WHERE related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL
       DO UPDATE SET title = EXCLUDED.title, kind = 'action', due_date = NULL, status = 'pending'`,
      [row.company_id, details.title, row.id]
    );
    registered += 1;
  }

  console.log(`Действия зарегистрированы для ${registered} открытых нарушений с risk >= ${CRITICAL_RISK_THRESHOLD} (пропущено менее серьёзных: ${skippedLowRisk}, из ${rows.length} всего), без пуш-уведомлений.`);
  await pool.end();
}

run().catch((err) => {
  console.error('Не удалось выполнить backfill:', err);
  process.exit(1);
});
