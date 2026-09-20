// "Документ уже есть?" — обобщение того же приёма, что и в
// homePremisesSignal.js: не спрашиваем повторно, а читаем последний ответ на
// вопрос теста безопасности, который это уже выясняет (см. связку в
// content/templateViolationLinks.js). Один генерик-хелпер вместо отдельного
// файла на каждую пару вопрос/документ — линков много, механизм чтения один.
const pool = require('../../db/pool');
const { decrypt } = require('../../core/crypto');

// Новые ответы теста хранятся только зашифрованными (answer_index_enc,
// миграция 0024 — answer_index у них NULL), старые — открытой колонкой.
// До 20.09.2026 эти сигналы читали ТОЛЬКО answer_index и потому для всех
// ответов после шифрования всегда возвращали "нет" — найдено сквозным
// прогоном на боевой платформе (тестовая компания ответила "документ есть"
// на 5 вопросов, а alreadyHasDocument/worksFromHome не сработали ни разу).
// Тот же приём чтения, что в security.routes.js /complete и status.js.
function answerIndexOf(row) {
  if (!row) return null;
  return row.answer_index_enc ? Number(decrypt(row.answer_index_enc)) : row.answer_index;
}

async function latestAnswerIndex(companyId, questionCode) {
  const { rows } = await pool.query(
    `SELECT answer_index, answer_index_enc FROM security_answers WHERE company_id = $1 AND question_code = $2 ORDER BY created_at DESC LIMIT 1`,
    [companyId, questionCode]
  );
  return answerIndexOf(rows[0]);
}

async function alreadyHasDocument(companyId, link) {
  if (!link) return false;
  return (await latestAnswerIndex(companyId, link.questionCode)) === link.hasAnswerIndex;
}

module.exports = { alreadyHasDocument, latestAnswerIndex };
