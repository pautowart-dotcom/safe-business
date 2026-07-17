// Расчёт баллов, индекса безопасности и списка нарушений.
// Источник: docs/security-engine/09_Scoring_Logic_FINAL.md.
// Эта единая шкала используется и в бесплатном, и в платном аудите (Файл 09 §3).

const ZONES = [
  { key: 'green', min: 80, max: 100, label: 'Зелёная зона' },
  { key: 'yellow', min: 50, max: 79, label: 'Жёлтая зона' },
  { key: 'red', min: 0, max: 49, label: 'Красная зона' },
];

function zoneForPercent(percent) {
  return ZONES.find((z) => percent >= z.min && percent <= z.max) || ZONES[ZONES.length - 1];
}

function indexPercent(score, maxScore) {
  if (maxScore <= 0) return 0;
  return Math.round((score / maxScore) * 1000) / 10; // одна десятая процента
}

// answerIndex — порядковый номер выбранного варианта в question.answers.
function evaluateAnswer(question, answerIndex) {
  const answer = question.answers[answerIndex];
  if (!answer) throw new Error(`Некорректный вариант ответа для вопроса ${question.code}`);

  const points = answer.points;
  // Нарушение создаётся при 0 или 0,5 балла (Файл 09 §5). Особые случаи
  // (MN-103 второй вариант, MN-203 "контакта с кровью нет", MN-606 второй
  // вариант) закодированы как points=1 прямо в вопросе — отдельного
  // исключения тут не требуется. MN-205→MN-206-доп — через violationCodeOverride.
  const createsViolation = points < 1;
  const violationCode = createsViolation ? answer.violationCodeOverride || question.code : null;

  return { points, createsViolation, violationCode };
}

// questions — видимые вопросы сессии (после visibility.filterVisible);
// answersByCode — { [questionCode]: answerIndex }.
function scoreSession(questions, answersByCode) {
  let score = 0;
  const maxScore = questions.length;
  const violationCodes = [];
  const perQuestion = {};

  for (const question of questions) {
    const answerIndex = answersByCode[question.code];
    if (answerIndex === undefined) continue;

    const result = evaluateAnswer(question, answerIndex);
    score += result.points;
    perQuestion[question.code] = result;
    if (result.createsViolation) violationCodes.push(result.violationCode);
  }

  const percent = indexPercent(score, maxScore);
  return {
    score,
    maxScore,
    indexPercent: percent,
    zone: zoneForPercent(percent).key,
    violationCodes,
    perQuestion,
  };
}

// Топ-N нарушений бесплатного аудита по фиксированному приоритету (Файл 04 §3),
// а не по риску — в бесплатном тесте нет матрицы рисков, только порядок вопросов.
function topByPriority(violationCodes, priorityOrder, limit = 3) {
  return [...violationCodes]
    .sort((a, b) => priorityOrder.indexOf(a) - priorityOrder.indexOf(b))
    .slice(0, limit);
}

// Сортировка нарушений платного аудита для карты уязвимостей (Файл 11):
// по убыванию риска, при равном риске — по убыванию верхней границы штрафа.
function sortByRisk(violations) {
  return [...violations].sort((a, b) => {
    if (b.risk !== a.risk) return b.risk - a.risk;
    return (b.fineMax || 0) - (a.fineMax || 0);
  });
}

module.exports = { ZONES, zoneForPercent, indexPercent, evaluateAnswer, scoreSession, topByPriority, sortByRisk };
