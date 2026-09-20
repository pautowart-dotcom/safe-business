// Дневной потолок вопросов к ИИ-чату на компанию (20.09.2026). ИИ входит в
// подписку без отдельной платы (решение владельца: "все равно столько
// пользоваться не будут; если что — введём платно или поднимем цену"), а
// каждый вопрос стоит реальных денег на стороне YandexGPT — потолок не
// мешает обычному человеку (десятки вопросов в день — это уже много), но
// ограничивает убытки, если кто-то (или бот с украденным/купленным
// аккаунтом) начнёт гонять чат циклом. Считаем по event_log
// ('ai_advisor_chat.asked', пишется после каждого успешного ответа обоими
// чатами) — отдельной таблицы счётчиков не заводим.
const pool = require('../db/pool');

const DAILY_LIMIT = 40;

async function isOverDailyAiLimit(companyId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS n FROM event_log
     WHERE company_id = $1 AND entity_type = 'ai_advisor_chat' AND action = 'ai_advisor_chat.asked'
       AND created_at >= date_trunc('day', now())`,
    [companyId]
  );
  return Number(rows[0].n) >= DAILY_LIMIT;
}

module.exports = { isOverDailyAiLimit, DAILY_LIMIT };
