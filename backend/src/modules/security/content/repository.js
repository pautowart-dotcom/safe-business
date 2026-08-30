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
const inspectionGuides = require('./inspectionGuides');

const PAID_QUESTIONS_BY_NICHE = {
  manicure: require('./paid-questions/manicure'),
  lashes_brows: require('./paid-questions/lashes-brows'),
  hair: require('./paid-questions/hair'),
  massage: require('./paid-questions/massage'),
  tattoo: require('./paid-questions/tattoo'),
  depilation: require('./paid-questions/depilation'),
  solarium: require('./paid-questions/solarium'),
  cleaning_basic: require('./paid-questions/cleaning-basic'),
  barbershop: require('./paid-questions/barbershop'),
  cafe_basic: require('./paid-questions/cafe-basic'),
  universal: require('./paid-questions/universal'),
};

const VIOLATIONS_BY_NICHE = {
  manicure: require('./violations/manicure'),
  lashes_brows: require('./violations/lashes-brows'),
  hair: require('./violations/hair'),
  massage: require('./violations/massage'),
  tattoo: require('./violations/tattoo'),
  depilation: require('./violations/depilation'),
  solarium: require('./violations/solarium'),
  cleaning_basic: require('./violations/cleaning-basic'),
  barbershop: require('./violations/barbershop'),
  cafe_basic: require('./violations/cafe-basic'),
  universal: require('./violations/universal'),
};

const MANDATORY_DOCUMENTS_BY_NICHE = {
  manicure: require('./pdf/mandatory-documents/manicure'),
  lashes_brows: require('./pdf/mandatory-documents/lashes-brows'),
  hair: require('./pdf/mandatory-documents/hair'),
  massage: require('./pdf/mandatory-documents/massage'),
  tattoo: require('./pdf/mandatory-documents/tattoo'),
  depilation: require('./pdf/mandatory-documents/depilation'),
  solarium: require('./pdf/mandatory-documents/solarium'),
  cleaning_basic: require('./pdf/mandatory-documents/cleaning-basic'),
  barbershop: require('./pdf/mandatory-documents/barbershop'),
  cafe_basic: require('./pdf/mandatory-documents/cafe-basic'),
  universal: require('./pdf/mandatory-documents/universal'),
};

const ATTENTION_ZONES_BY_NICHE = {
  manicure: require('./pdf/attention-zones/manicure'),
  lashes_brows: require('./pdf/attention-zones/lashes-brows'),
  hair: require('./pdf/attention-zones/hair'),
  massage: require('./pdf/attention-zones/massage'),
  tattoo: require('./pdf/attention-zones/tattoo'),
  depilation: require('./pdf/attention-zones/depilation'),
  solarium: require('./pdf/attention-zones/solarium'),
  cleaning_basic: require('./pdf/attention-zones/cleaning-basic'),
  barbershop: require('./pdf/attention-zones/barbershop'),
  cafe_basic: require('./pdf/attention-zones/cafe-basic'),
  universal: require('./pdf/attention-zones/universal'),
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

// Не зависит от ниши (в отличие от остального контента здесь) — права и
// порядок действий при проверке одинаковы для любой ниши, см. комментарий
// в inspectionGuides.js. labor_inspection фильтруется по hasEmployees
// вызывающим кодом (security.routes.js), тем же полем, что и остальной
// employerOnly-контент.
async function getInspectionGuides() {
  return inspectionGuides;
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
  getInspectionGuides,
};
