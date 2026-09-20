// Дневные потолки на платные для нас операции с ИИ (20.09.2026). ИИ входит в
// подписку без отдельной платы (решение владельца: "все равно столько
// пользоваться не будут; если что — введём платно или поднимем цену"), а
// каждое обращение стоит реальных денег на стороне YandexGPT/Vision —
// потолок не мешает обычному человеку, но ограничивает убытки, если кто-то
// (или бот с украденным/купленным аккаунтом) начнёт гонять функцию циклом.
// Считаем по event_log (пишется после каждого успешного обращения) —
// отдельной таблицы счётчиков не заводим.
const pool = require('../db/pool');

const DAILY_LIMIT = 40;

async function isOverDailyEventLimit(companyId, entityType, action, limit) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS n FROM event_log
     WHERE company_id = $1 AND entity_type = $2 AND action = $3
       AND created_at >= date_trunc('day', now())`,
    [companyId, entityType, action]
  );
  return Number(rows[0].n) >= limit;
}

// Чат: 40 вопросов на компанию в сутки (оба чата пишут ai_advisor_chat.asked).
function isOverDailyAiLimit(companyId) {
  return isOverDailyEventLimit(companyId, 'ai_advisor_chat', 'ai_advisor_chat.asked', DAILY_LIMIT);
}

module.exports = { isOverDailyAiLimit, isOverDailyEventLimit, DAILY_LIMIT };
