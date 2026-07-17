// Сборка данных полного отчёта — структура и порядок разделов из Файла 08
// (СТРУКТУРА PDF-ОТЧЁТА) и Файла 09 §7 (ПОРЯДОК ФОРМИРОВАНИЯ PDF). Результат —
// обычный JS-объект: используется и для рендера PDF (report/pdf.js), и как
// JSON для личного кабинета ("платный аудит → персональная страница, не
// PDF" — product-context.md), чтобы не дублировать сборку данных для двух
// разных представлений одного и того же отчёта.

const repository = require('../content/repository');
const scoring = require('../content/scoring');
const { buildRoadmap, buildForecast } = require('./roadmap');
const { buildRecommendations } = require('./recommendations');

const ZONE_LABELS = { green: 'Зелёная зона', yellow: 'Жёлтая зона', red: 'Красная зона' };

const LEGAL_FORM_LABELS = { self_employed: 'Самозанятый', ip: 'ИП', ooo: 'ООО' };

// Файл 08 §3 — порядок и подписи блоков сводной таблицы.
const SUMMARY_BLOCKS = [
  { block: 1, label: 'Юридическая база' },
  { block: 2, label: 'Санитарная безопасность' },
  { block: 3, label: 'Оборудование' },
  { block: 5, label: 'Персональные данные' },
  { block: 4, label: 'Персонал', employerOnly: true },
  { block: 6, label: 'Помещение' },
  { block: 7, label: 'Дополнительные зоны' },
];

// Файл 08, стр. 12 — общедоступные сведения о профиле контролирующих
// органов (не персонализировано под ответы пользователя).
const AUTHORITIES = [
  { name: 'Роспотребнадзор', checks: 'Санитарные нормы, защиту прав потребителей, персональные данные клиентов.', requests: 'Журналы стерилизации/уборки, ППК, сертификаты на материалы, согласия клиентов.' },
  { name: 'Роскомнадзор', checks: 'Обработку персональных данных.', requests: 'Уведомление оператора ПД, политику конфиденциальности, согласия на обработку ПД.' },
  { name: 'Государственная инспекция труда', checks: 'Оформление сотрудников и охрану труда.', requests: 'Трудовые договоры, СОУТ, журналы инструктажа, медкнижки сотрудников.' },
  { name: 'МЧС', checks: 'Пожарную безопасность помещения.', requests: 'План эвакуации, акты проверки огнетушителей, документы на пожарную сигнализацию.' },
  { name: 'ФНС', checks: 'Кассовую и налоговую дисциплину.', requests: 'Чеки, документы по расчётам с клиентами и подрядчиками.' },
];

const NEXT_STEPS = [
  'Исправлять самостоятельно по дорожной карте.',
  'Использовать готовые шаблоны документов (будущий продукт, без указания цены до запуска).',
  'Получить сопровождение под ключ (будущий продукт).',
];

const DISCLAIMER =
  'Настоящий отчёт носит исключительно информационный характер и не является юридической консультацией либо официальным заключением. ' +
  'Информация сформирована на основании ответов пользователя и действующего законодательства РФ на дату формирования отчёта. ' +
  'Перечень нарушений и рекомендаций не является исчерпывающим для каждой конкретной ситуации, региона или формы собственности. ' +
  'Оценка штрафов носит ориентировочный характер и основана на верхних границах санкций, предусмотренных законом. ' +
  'Сервис «Безопасный Бизнес» не несёт ответственности за решения, принятые пользователем на основании данного документа, а также за штрафы, санкции или иные последствия проверок контролирующих органов. ' +
  'Для принятия юридически значимых решений рекомендуется обратиться к профильному специалисту.';

function summaryByBlock(answersWithBlocks, hasEmployees) {
  return SUMMARY_BLOCKS.filter((b) => !b.employerOnly || hasEmployees).map(({ block, label }) => {
    const rows = answersWithBlocks.filter((a) => a.block === block);
    const score = rows.reduce((sum, r) => sum + Number(r.points), 0);
    return { label, score, maxScore: rows.length, zone: scoring.zoneForPercent(scoring.indexPercent(score, rows.length || 1)).key };
  });
}

// violations — уже: результат JOIN security_violations x матрица для данной
// сессии (код, статус, все поля из Файла 10), не отсортирован.
// answersWithBlocks — [{ code, block, points }] по вопросам этой сессии.
async function buildReport({ session, profile, violations, answersWithBlocks, reportNumber }) {
  const hasEmployees = profile.workModel === 'employees' || profile.workModel === 'mixed';
  const sortedViolations = scoring.sortByRisk(violations);

  const roadmap = buildRoadmap(sortedViolations);
  const forecast = buildForecast({ score: Number(session.score), maxScore: Number(session.max_score), roadmap });
  const recommendations = buildRecommendations({ violations: sortedViolations, zone: session.zone, forecast });

  const mandatoryDocuments = (await repository.getMandatoryDocuments(profile.niche) || [])
    .filter((section) => !section.employerOnly || hasEmployees);
  const attentionZones = (await repository.getAttentionZones(profile.niche)) || [];

  const criticalCount = sortedViolations.filter((v) => v.risk >= 9).length;
  const worstViolation = sortedViolations[0] || null;
  const nicheContent = await repository.getNiche(profile.segment, profile.niche);

  return {
    titlePage: {
      niche: nicheContent ? nicheContent.label : profile.niche,
      legalForm: LEGAL_FORM_LABELS[profile.legalForm],
      generatedAt: new Date(),
      reportNumber,
      zone: session.zone,
      zoneLabel: ZONE_LABELS[session.zone],
    },
    summary: {
      indexPercent: Number(session.index_percent),
      zoneLabel: ZONE_LABELS[session.zone],
      violationsCount: sortedViolations.length,
      criticalCount,
      estimatedFineMax: sortedViolations.reduce((sum, v) => sum + (v.fineMax || 0), 0),
      worstViolation,
      firstAction: worstViolation ? { title: worstViolation.title, days: worstViolation.daysMin } : null,
      blocks: summaryByBlock(answersWithBlocks, hasEmployees),
      topThree: sortedViolations.slice(0, 3),
    },
    vulnerabilityMap: sortedViolations,
    roadmap,
    mandatoryDocuments,
    attentionZones,
    recommendations,
    authorities: AUTHORITIES,
    nextSteps: NEXT_STEPS,
    disclaimer: DISCLAIMER,
  };
}

module.exports = { buildReport, ZONE_LABELS, LEGAL_FORM_LABELS };
