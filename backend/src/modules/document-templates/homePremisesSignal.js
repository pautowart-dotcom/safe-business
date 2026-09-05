// "Работает из дома" для генерации документов (05.09.2026) — не отдельный
// вопрос анкеты (владелец прямо просил переиспользовать то, что уже есть на
// платформе, не спрашивать заново), а вычисление по уже сохранённому ответу
// на вопрос теста безопасности (MN-101, paid-questions/manicure.js —
// добавлен по реальному вопросу клиентки, см. MN-101-доп в
// violations/manicure.js). security_profiles/security_profile_niches не
// хранят такое поле для ниши "маникюр" (has_premises там жёстко привязан
// только к нише 'universal', см. security/profile.js) — здесь читаем прямо
// сохранённый ответ конкретного вопроса, а не общий профиль.
//
// getPaidQuestions — кросс-модульное чтение (тот же осознанный принцип, что
// у computeSecurityStatus в ai-assistant/tools/registry.js): вопросник живёт
// в security, дублировать его здесь заново — риск разойтись с настоящим.
const pool = require('../../db/pool');
const securityRepository = require('../security/content/repository');

// Ищем ответ по маркеру violationCodeOverride, а не по индексу варианта в
// массиве answers — переживёт изменение порядка/добавление новых вариантов
// в сам вопрос, не будет молча ломаться при правке контента теста.
const HOME_PREMISES_QUESTION = {
  manicure: { code: 'MN-101', overrideCode: 'MN-101-доп' },
};

async function worksFromHome(companyId, niche) {
  const config = HOME_PREMISES_QUESTION[niche];
  if (!config) return false;

  const questions = await securityRepository.getPaidQuestions(niche);
  const question = questions && questions.find((q) => q.code === config.code);
  if (!question) return false;
  const homeAnswerIndex = question.answers.findIndex((a) => a.violationCodeOverride === config.overrideCode);
  if (homeAnswerIndex === -1) return false;

  // Последний ответ на этот вопрос (ORDER BY created_at DESC) — если тест
  // проходили повторно и ответ изменился, важен актуальный, не первый.
  const { rows } = await pool.query(
    `SELECT answer_index FROM security_answers WHERE company_id = $1 AND question_code = $2 ORDER BY created_at DESC LIMIT 1`,
    [companyId, config.code]
  );
  return rows[0]?.answer_index === homeAnswerIndex;
}

module.exports = { worksFromHome };
