// Единственная точка доступа к контенту модуля безопасности (вопросы, матрица
// нарушений, сегменты). Сейчас источник — статические файлы в content/, но
// весь остальной код модуля (scoring, visibility, роуты, генерация отчёта)
// обращается ТОЛЬКО через функции ниже, а не импортирует content/*.js напрямую.
//
// Это осознанный задел на будущее: когда понадобится редактирование вопросов
// и штрафов через админку без участия разработчика, здесь функции меняются на
// pool.query(...) к таблицам security_questions / security_violations_catalog
// с тем же форматом объектов (см. content/paid-questions/manicure.js и
// content/violations/manicure.js — их форма 1:1 ложится в строки таблиц) —
// и ни scoring.js, ни visibility.js, ни роуты, ни PDF-сборка не меняются.

const { SEGMENTS, findSegment, findNiche } = require('./segments');

const PAID_QUESTIONS_BY_NICHE = {
  manicure: require('./paid-questions/manicure'),
  lashes_brows: require('./paid-questions/lashes-brows'),
  hair: require('./paid-questions/hair'),
  massage: require('./paid-questions/massage'),
};

const VIOLATIONS_BY_NICHE = {
  manicure: require('./violations/manicure'),
  lashes_brows: require('./violations/lashes-brows'),
  hair: require('./violations/hair'),
  massage: require('./violations/massage'),
};

const MANDATORY_DOCUMENTS_BY_NICHE = {
  manicure: require('./pdf/mandatory-documents/manicure'),
  lashes_brows: require('./pdf/mandatory-documents/lashes-brows'),
  hair: require('./pdf/mandatory-documents/hair'),
  massage: require('./pdf/mandatory-documents/massage'),
};

const ATTENTION_ZONES_BY_NICHE = {
  manicure: require('./pdf/attention-zones/manicure'),
  lashes_brows: require('./pdf/attention-zones/lashes-brows'),
  hair: require('./pdf/attention-zones/hair'),
  massage: require('./pdf/attention-zones/massage'),
};

async function getSegments() {
  return SEGMENTS;
}

async function getSegment(segmentKey) {
  return findSegment(segmentKey);
}

async function getNiche(segmentKey, nicheKey) {
  return findNiche(segmentKey, nicheKey);
}

async function getPaidQuestions(niche) {
  const content = PAID_QUESTIONS_BY_NICHE[niche];
  return content ? content.questions : null;
}

async function getFeedbackOptions(niche) {
  const content = PAID_QUESTIONS_BY_NICHE[niche];
  return content ? content.feedbackOptions : [];
}

async function getViolationMatrix(niche) {
  const content = VIOLATIONS_BY_NICHE[niche];
  return content ? content.violations : null;
}

async function getViolation(niche, code) {
  const matrix = await getViolationMatrix(niche);
  if (!matrix) return null;
  return matrix.find((v) => v.code === code) || null;
}

async function getMandatoryDocuments(niche) {
  const content = MANDATORY_DOCUMENTS_BY_NICHE[niche];
  return content ? content.sections : null;
}

async function getAttentionZones(niche) {
  const content = ATTENTION_ZONES_BY_NICHE[niche];
  return content ? content.zones : null;
}

module.exports = {
  getSegments,
  getSegment,
  getNiche,
  getPaidQuestions,
  getFeedbackOptions,
  getViolationMatrix,
  getViolation,
  getMandatoryDocuments,
  getAttentionZones,
};
