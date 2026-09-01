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
// Блок 9 (Финансовая безопасность, 01.09.2026) — новый, не из Файла 08,
// добавлен для риска блокировки счёта по 115-ФЗ (см. docs/vision.md.txt).
// Общий для всех ниш (не привязан к отраслевой специфике), в отличие от
// остальных блоков 1-7. Именно 9, не 8 — в 6 из 11 ниш (hair, tattoo,
// depilation, solarium, cleaning-basic, cafe-basic) блок 8 уже занят
// другим нишевым содержанием (например, химия у hair.js); единая
// глобальная подпись SUMMARY_BLOCKS не может значить разное в разных
// нишах под одним номером — поэтому финансовый блок унифицирован на 9
// во всех 11 нишах, даже там, где 8 был свободен.
const SUMMARY_BLOCKS = [
  { block: 1, label: 'Юридическая база' },
  { block: 2, label: 'Санитарная безопасность' },
  { block: 3, label: 'Оборудование' },
  { block: 5, label: 'Персональные данные' },
  { block: 4, label: 'Персонал', employerOnly: true },
  { block: 6, label: 'Помещение' },
  { block: 7, label: 'Дополнительные зоны' },
  { block: 9, label: 'Финансовая безопасность' },
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

const FRONTEND_BASE = process.env.FRONTEND_URL || 'https://business-safe.ru/lk';

const NEXT_STEPS = [
  'Исправлять самостоятельно по дорожной карте выше.',
  'Использовать готовые шаблоны документов по вашей нише — уже доступны в личном кабинете.',
  'Настроить напоминания на конкретные даты (медкнижки, СОУТ, огнетушители и т.д.) в разделе «Мои сроки», чтобы не возвращаться к этому отчёту вручную.',
];

// Файл 08 §7 (расширение 26.08.2026, по запросу владельца) — что делать,
// если проверка уже была и штраф уже выписан. Общий порядок по КоАП РФ,
// не привязан к конкретному нарушению/нише. Ссылки на статьи даны с
// оговоркой "как правило" / "уточните применимость" — скидка на оплату
// штрафа действует не для всех статей КоАП, это не юридическая консультация
// (см. общий disclaimer отчёта).
const WHAT_IF_FINED = [
  {
    title: 'Проверьте протокол и постановление',
    text: 'Убедитесь, что данные компании и суть нарушения указаны верно. Ошибки в документе — основание для обжалования.',
  },
  {
    title: 'Узнайте срок на обжалование',
    text: 'По ст. 30.3 КоАП РФ на обжалование постановления, как правило, даётся 10 дней с момента получения копии.',
  },
  {
    title: 'Проверьте право на скидку при оплате',
    text: 'По ряду статей КоАП РФ (ст. 32.2 ч.1.3) при уплате штрафа в течение 20 дней предоставляется скидка 50%. Действует не для всех нарушений — уточните применимость к вашей статье.',
  },
  {
    title: 'Устраните само нарушение, а не только штраф',
    text: 'Повторное нарушение того же пункта при следующей проверке часто наказывается строже первого.',
  },
  {
    title: 'При сомнениях — к специалисту',
    text: 'Особенно если сумма штрафа значительная или есть основания для обжалования протокола.',
  },
];

const PLATFORM_BRIDGE = {
  intro: 'Этот PDF — снимок на дату формирования. Все документы, сроки и шаблоны из отчёта уже сохранены в вашем личном кабинете — не нужно хранить только эту распечатку.',
  links: [
    { label: 'Мои сроки — настроить напоминания', url: `${FRONTEND_BASE}/deadlines` },
    { label: 'Готовые шаблоны документов по вашей нише', url: `${FRONTEND_BASE}/security` },
  ],
};

const DISCLAIMER =
  'Настоящий отчёт носит исключительно информационный характер и не является юридической консультацией либо официальным заключением. ' +
  'Информация сформирована на основании ответов пользователя и действующего законодательства РФ на дату формирования отчёта. ' +
  'Перечень нарушений и рекомендаций не является исчерпывающим для каждой конкретной ситуации, региона или формы собственности. ' +
  'Оценка штрафов носит ориентировочный характер и основана на верхних границах санкций, предусмотренных законом. ' +
  'Сервис «Безопасный Бизнес» не несёт ответственности за решения, принятые пользователем на основании данного документа, а также за штрафы, санкции или иные последствия проверок контролирующих органов. ' +
  'Для принятия юридически значимых решений рекомендуется обратиться к профильному специалисту.';

// .filter(maxScore > 0) в конце (01.09.2026, добавлен вместе с блоком 8) —
// раньше блок без единого вопроса у ниши физически не встречался (все 7
// блоков 1-7, кроме employerOnly, были в каждой нише полностью), поэтому
// фильтра не требовалось. Блок 8 сначала есть не у всех ниш сразу (только
// там, где реально добавлены вопросы) — без этого фильтра ниши без блока 8
// показывали бы в отчёте пустую строку "0/0, Красная зона", хотя вопрос
// вообще не задавался.
function summaryByBlock(answersWithBlocks, hasEmployees) {
  return SUMMARY_BLOCKS.filter((b) => !b.employerOnly || hasEmployees)
    .map(({ block, label }) => {
      const rows = answersWithBlocks.filter((a) => a.block === block);
      const score = rows.reduce((sum, r) => sum + Number(r.points), 0);
      return { label, score, maxScore: rows.length, zone: scoring.zoneForPercent(scoring.indexPercent(score, rows.length || 1)).key };
    })
    .filter((b) => b.maxScore > 0);
}

// violations — результат JOIN security_violations x матрица(ы) актуальных
// ниш (код, статус, все поля из Файла 10), не отсортирован.
// answersWithBlocks — [{ code, block, points }] по вопросам всех учтённых
// сессий (по одной на нишу). mandatoryDocuments/attentionZones — уже
// объединены по нескольким нишам (mergeSections.js), сюда приходят готовыми.
// niches — массив ключей ниш, вошедших в отчёт (для заголовка).
async function buildReport({ niches, profile, score, maxScore, indexPercent, zone, violations, answersWithBlocks, mandatoryDocuments, attentionZones, reportNumber }) {
  const hasEmployees = profile.workModel === 'employees' || profile.workModel === 'mixed';
  const sortedViolations = scoring.sortByRisk(violations);

  const roadmap = buildRoadmap(sortedViolations);
  const forecast = buildForecast({ score, maxScore, roadmap });
  const recommendations = buildRecommendations({ violations: sortedViolations, zone, forecast });

  const filteredMandatoryDocuments = (mandatoryDocuments || []).filter((section) => !section.employerOnly || hasEmployees);

  const criticalCount = sortedViolations.filter((v) => v.risk >= 9).length;
  const worstViolation = sortedViolations[0] || null;
  const nicheLabels = [];
  for (const niche of niches) {
    const nicheContent = await repository.getNiche(profile.segment, niche);
    nicheLabels.push(nicheContent ? nicheContent.label : niche);
  }

  return {
    titlePage: {
      niche: nicheLabels.length > 0 ? nicheLabels.join(' + ') : '—',
      legalForm: LEGAL_FORM_LABELS[profile.legalForm],
      generatedAt: new Date(),
      reportNumber,
      zone,
      zoneLabel: ZONE_LABELS[zone],
    },
    summary: {
      indexPercent: Number(indexPercent),
      zoneLabel: ZONE_LABELS[zone],
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
    mandatoryDocuments: filteredMandatoryDocuments,
    attentionZones: attentionZones || [],
    recommendations,
    authorities: AUTHORITIES,
    nextSteps: NEXT_STEPS,
    whatIfFined: WHAT_IF_FINED,
    platformBridge: PLATFORM_BRIDGE,
    disclaimer: DISCLAIMER,
  };
}

module.exports = { buildReport, ZONE_LABELS, LEGAL_FORM_LABELS };
