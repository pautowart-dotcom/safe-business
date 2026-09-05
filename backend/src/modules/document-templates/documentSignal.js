// "Документ уже есть?" — обобщение того же приёма, что и в
// homePremisesSignal.js: не спрашиваем повторно, а читаем последний ответ на
// вопрос теста безопасности, который это уже выясняет (см. связку в
// content/templateViolationLinks.js). Один генерик-хелпер вместо отдельного
// файла на каждую пару вопрос/документ — линков много, механизм чтения один.
const pool = require('../../db/pool');

async function alreadyHasDocument(companyId, link) {
  if (!link) return false;
  const { rows } = await pool.query(
    `SELECT answer_index FROM security_answers WHERE company_id = $1 AND question_code = $2 ORDER BY created_at DESC LIMIT 1`,
    [companyId, link.questionCode]
  );
  return rows[0]?.answer_index === link.hasAnswerIndex;
}

module.exports = { alreadyHasDocument };
