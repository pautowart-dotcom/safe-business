// Рендер отчёта (report/build.js) в PDF через pdfmake. Шрифт — DejaVu Sans
// (пакет dejavu-fonts-ttf, лицензия Bitstream Vera — свободное распространение
// и встраивание разрешено явно). Он нужен, потому что 14 стандартных PDF-шрифтов
// (Helvetica и т.п.) не поддерживают кириллицу вообще — без встроенного
// Unicode-шрифта русский текст в PDF не отобразится.
const path = require('path');
const PdfPrinter = require('pdfmake/src/printer');

const FONT_DIR = path.dirname(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'));
const FONTS = {
  DejaVuSans: {
    normal: path.join(FONT_DIR, 'DejaVuSans.ttf'),
    bold: path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'),
    italics: path.join(FONT_DIR, 'DejaVuSans-Oblique.ttf'),
    bolditalics: path.join(FONT_DIR, 'DejaVuSans-BoldOblique.ttf'),
  },
};

const RISK_COLORS = [
  { min: 9, color: '#c0392b' }, // критично
  { min: 7, color: '#e67e22' }, // высокий
  { min: 5, color: '#f1c40f' }, // средний
  { min: 0, color: '#27ae60' }, // низкий
];
function riskColor(risk) {
  return RISK_COLORS.find((r) => risk >= r.min).color;
}

function money(value) {
  if (value == null) return '—';
  return `${value.toLocaleString('ru-RU')} ₽`;
}

function sectionHeader(text) {
  return { text, style: 'sectionHeader', margin: [0, 16, 0, 8] };
}

function violationBlock(v, index) {
  return {
    margin: [0, 0, 0, 10],
    stack: [
      { text: `№${index + 1}  ${v.title}`, bold: true, fontSize: 12, color: riskColor(v.risk) },
      { text: v.description },
      { text: `Риск: ${v.risk}/10`, color: riskColor(v.risk), bold: true },
      { text: `Возможный штраф: ${v.fineText}` },
      { text: `Основание: ${v.normBase}` },
      { text: `Что сделать: ${v.solution}` },
      { text: `Стоимость: ${v.free ? 'бесплатно' : money(v.costMin)}   Срок: ${v.daysMin}${v.daysMax && v.daysMax !== v.daysMin ? '–' + v.daysMax : ''} дн.` },
    ],
  };
}

function roadmapBucket(title, items) {
  if (items.length === 0) return null;
  return {
    margin: [0, 4, 0, 10],
    stack: [
      { text: title, bold: true, margin: [0, 0, 0, 4] },
      { ul: items.map((v) => `${v.title} — ${v.free ? 'бесплатно' : money(v.costMin)}, ${v.daysMin} дн.`) },
    ],
  };
}

function buildDocDefinition(report) {
  const { titlePage, summary, vulnerabilityMap, roadmap, mandatoryDocuments, attentionZones, recommendations, authorities, nextSteps, disclaimer } = report;

  const content = [
    // --- Титульный лист ---
    { text: 'Безопасный Бизнес', style: 'brand', margin: [0, 120, 0, 0] },
    { text: 'Полный аудит безопасности бизнеса', fontSize: 16, margin: [0, 4, 0, 30] },
    { text: `Ниша: ${titlePage.niche}` },
    { text: `Форма работы: ${titlePage.legalForm}` },
    { text: `Дата формирования: ${titlePage.generatedAt.toLocaleDateString('ru-RU')}` },
    { text: `ID отчёта: ${titlePage.reportNumber}` },
    { text: `Статус безопасности: ${titlePage.zoneLabel}`, bold: true, margin: [0, 10, 0, 0] },
    { text: 'Отчёт носит информационный характер и не является юридическим заключением.', fontSize: 9, italics: true, margin: [0, 60, 0, 0] },
    { text: '', pageBreak: 'after' },

    // --- Резюме руководителя ---
    sectionHeader('Резюме руководителя'),
    { text: `Статус бизнеса: ${summary.zoneLabel}` },
    { text: `Индекс безопасности: ${summary.indexPercent}%` },
    { text: `Найдено нарушений: ${summary.violationsCount}` },
    { text: `Критических нарушений (риск 9–10): ${summary.criticalCount}` },
    { text: `Ориентировочные риски: до ${money(summary.estimatedFineMax)}` },
    summary.worstViolation ? { text: `Самое опасное нарушение: ${summary.worstViolation.title}` } : null,
    summary.firstAction ? { text: `Первое действие: ${summary.firstAction.title} (срок: ${summary.firstAction.days} дн.)` } : null,

    { text: 'Общая карта безопасности', style: 'subheader', margin: [0, 14, 0, 6] },
    {
      table: {
        widths: ['*', 'auto', 'auto'],
        body: [
          [{ text: 'Блок', bold: true }, { text: 'Баллы', bold: true }, { text: 'Статус', bold: true }],
          ...summary.blocks.map((b) => [b.label, `${b.score}/${b.maxScore}`, { text: b.zone === 'green' ? 'Зелёная' : b.zone === 'yellow' ? 'Жёлтая' : 'Красная', color: riskColor(b.zone === 'green' ? 1 : b.zone === 'yellow' ? 6 : 9) }]),
        ],
      },
      margin: [0, 0, 0, 10],
    },

    summary.topThree.length > 0 ? { text: 'Три главные уязвимости', style: 'subheader', margin: [0, 10, 0, 6] } : null,
    ...summary.topThree.map((v, i) => violationBlock(v, i)),
    { text: '', pageBreak: 'after' },

    // --- Карта уязвимостей ---
    sectionHeader('Карта уязвимостей'),
    vulnerabilityMap.length === 0
      ? {
          stack: [
            { text: 'По результатам аудита критических нарушений не выявлено.' },
            { text: 'Однако отсутствие нарушений в рамках проверки не гарантирует отсутствие иных рисков бизнеса. Рекомендуем ознакомиться с разделом «Дополнительные зоны внимания».' },
          ],
        }
      : { stack: vulnerabilityMap.map((v, i) => violationBlock(v, i)) },
    { text: '', pageBreak: 'after' },

    // --- Дорожная карта устранения ---
    sectionHeader('Дорожная карта устранения'),
    roadmapBucket('Сделать сегодня (до 1 дня)', roadmap.today),
    roadmapBucket('Сделать за 7 дней', roadmap.week),
    roadmapBucket('Сделать за 14 дней', roadmap.twoWeeks),
    roadmapBucket('Сделать за 30 дней и далее', roadmap.month),
    roadmap.quickWins.length > 0
      ? {
          margin: [0, 10, 0, 10],
          stack: [
            { text: 'Быстрые победы', bold: true, margin: [0, 0, 0, 4] },
            { text: 'Вы можете снизить уровень риска бизнеса уже сегодня.' },
            { ul: roadmap.quickWins.map((v) => `${v.solution} Стоимость: 0 ₽.`) },
          ],
        }
      : null,
    { text: `Ориентировочный бюджет устранения нарушений: от ${money(roadmap.budgetMin)}`, bold: true, margin: [0, 6, 0, 0] },
    { text: 'Важно: расчёт предварительный и зависит от региона, подрядчиков и особенностей бизнеса.', fontSize: 9, italics: true },
    { text: '', pageBreak: 'after' },

    // --- Обязательные документы ---
    sectionHeader('Обязательные документы'),
    ...mandatoryDocuments.map((section) => ({
      margin: [0, 6, 0, 6],
      stack: [{ text: section.title, bold: true, margin: [0, 0, 0, 4] }, { ul: section.items }],
    })),
    { text: '', pageBreak: 'after' },

    // --- Дополнительные зоны внимания ---
    sectionHeader('Дополнительные зоны внимания'),
    { text: 'Данный аудит не охватывает абсолютно все возможные риски бизнеса. Ниже перечислены дополнительные направления, которые рекомендуется проверить отдельно.', margin: [0, 0, 0, 10] },
    ...attentionZones.map((zone) => ({
      margin: [0, 0, 0, 10],
      stack: [
        { text: zone.title, bold: true },
        { text: zone.issue },
        { text: `Что проверить: ${zone.checkWhat}` },
        { text: `Нормативная база: ${zone.normBase}`, fontSize: 9, italics: true },
      ],
    })),
    { text: '', pageBreak: 'after' },

    // --- Персональные рекомендации ---
    sectionHeader('Персональные рекомендации'),
    { text: recommendations.mainVerdict, margin: [0, 0, 0, 10] },
    recommendations.topActions.length > 0
      ? { text: 'Что сделать в первую очередь', style: 'subheader', margin: [0, 6, 0, 4] }
      : null,
    { ul: recommendations.topActions.map((v) => `${v.title} (риск ${v.risk}/10) — ${v.solution}`) },
    recommendations.freeFixes.length > 0
      ? {
          margin: [0, 10, 0, 0],
          stack: [
            { text: 'Что можно исправить без денег', style: 'subheader', margin: [0, 0, 0, 4] },
            { ul: recommendations.freeFixes.map((v) => v.solution) },
          ],
        }
      : null,
    recommendations.needsSpecialist.length > 0
      ? {
          margin: [0, 10, 0, 0],
          stack: [
            { text: 'Где может понадобиться помощь специалистов', style: 'subheader', margin: [0, 0, 0, 4] },
            { text: 'Часть выявленных вопросов может потребовать привлечения профильных специалистов. Это нормальная практика и не означает наличие серьёзных проблем в бизнесе.' },
            { ul: recommendations.needsSpecialist.map((v) => v.title) },
          ],
        }
      : null,
    {
      margin: [0, 10, 0, 0],
      text: `Прогноз: при выполнении мероприятий из первых двух блоков дорожной карты будет устранено ${recommendations.forecast.fixableCount} нарушений, уровень безопасности вырастет до ${recommendations.forecast.projectedPercent}%, количество критических рисков снизится с ${recommendations.forecast.criticalBefore} до ${recommendations.forecast.criticalAfter}.`,
    },
    { text: 'Рекомендации по управлению рисками', style: 'subheader', margin: [0, 10, 0, 4] },
    { text: recommendations.riskManagementText },
    { text: `Готовность к проверке: ${recommendations.readiness.label}`, bold: true, margin: [0, 10, 0, 0] },
    { text: recommendations.readiness.text },
    { text: '', pageBreak: 'after' },

    // --- Какие органы могут проверять бизнес ---
    sectionHeader('Какие органы могут проверять бизнес'),
    ...authorities.map((a) => ({
      margin: [0, 0, 0, 8],
      stack: [{ text: a.name, bold: true }, { text: `Что проверяет: ${a.checks}` }, { text: `Что обычно запрашивает: ${a.requests}` }],
    })),

    // --- Что делать дальше ---
    sectionHeader('Что делать дальше'),
    { ol: nextSteps },

    // --- Дисклеймер ---
    sectionHeader('Дисклеймер'),
    { text: disclaimer, fontSize: 9 },
    { text: `Дата формирования: ${titlePage.generatedAt.toLocaleDateString('ru-RU')}`, fontSize: 9, margin: [0, 10, 0, 0] },
    { text: `ID отчёта: ${titlePage.reportNumber}`, fontSize: 9 },
  ].filter(Boolean);

  return {
    content,
    defaultStyle: { font: 'DejaVuSans', fontSize: 10 },
    styles: {
      brand: { fontSize: 26, bold: true },
      sectionHeader: { fontSize: 16, bold: true },
      subheader: { fontSize: 12, bold: true },
    },
    pageMargins: [40, 40, 40, 40],
  };
}

function renderPdf(report) {
  const printer = new PdfPrinter(FONTS);
  const doc = printer.createPdfKitDocument(buildDocDefinition(report));

  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

module.exports = { renderPdf };
