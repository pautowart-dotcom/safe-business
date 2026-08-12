// Рендер отчёта (report/build.js) в PDF через pdfmake. Шрифт — DejaVu Sans
// (пакет dejavu-fonts-ttf, лицензия Bitstream Vera — свободное распространение
// и встраивание разрешено явно). Он нужен, потому что 14 стандартных PDF-шрифтов
// (Helvetica и т.п.) не поддерживают кириллицу вообще — без встроенного
// Unicode-шрифта русский текст в PDF не отобразится.
//
// Оформление (12.08.2026, замечание владельца — "просто текст, должен быть
// как документ и ещё удобный") — это отчёт-аналитика, не юридический
// документ (в отличие от modules/document-templates/render.js, там нужен
// был ГОСТ Р 7.0.97), поэтому переделка другая: не Times/поля-под-подшивку,
// а профессиональная вёрстка бизнес-отчёта — оглавление для навигации по
// 8 разделам, карточки нарушений с цветной полосой риска вместо цветного
// текста, колонтитулы с номером отчёта и страницы на каждой странице,
// читаемые таблицы с заголовком-подложкой. Шрифт остаётся тем же
// (DejaVu Sans) — это аналитика, а не гражданско-правовой документ,
// рубленый шрифт здесь уместен и совпадает с остальным брендом продукта.
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

const ZONE_COLORS = { green: '#27ae60', yellow: '#f1c40f', red: '#c0392b' };
const ZONE_BG = { green: '#EAFAF1', yellow: '#FEF9E7', red: '#FDEDEC' };

function money(value) {
  if (value == null) return '—';
  return `${value.toLocaleString('ru-RU')} ₽`;
}

// Заголовок раздела — номер в цветном кружке + текст, одна и та же форма
// на титульной странице оглавления и перед самим разделом, чтобы читатель
// узнавал структуру документа взглядом, а не только по оглавлению.
function sectionHeader(number, text) {
  return {
    margin: [0, 0, 0, 14],
    columns: [
      {
        width: 26,
        table: { widths: [26], heights: [26], body: [[{ text: String(number), alignment: 'center', color: '#FFFFFF', bold: true, fontSize: 13, border: [false, false, false, false] }]] },
        layout: { fillColor: () => '#2A2A2E', paddingTop: () => 5 },
      },
      { width: 12, text: '' },
      { text, style: 'sectionTitle', margin: [0, 3, 0, 0] },
    ],
  };
}

// Карточка нарушения — цветная полоса слева (риск) + содержимое в лёгкой
// подложке, вместо разноцветного текста построчно (было раньше) — так
// нарушение читается как отдельная законченная единица, а не абзац.
function violationBlock(v, index) {
  const color = riskColor(v.risk);
  return {
    margin: [0, 0, 0, 12],
    columns: [
      { width: 4, table: { widths: [4], heights: [1], body: [[{ text: '', border: [false, false, false, false] }]] }, layout: { fillColor: () => color } },
      {
        width: '*',
        table: {
          widths: ['*'],
          body: [[{
            border: [false, false, false, false],
            stack: [
              { text: `№${index + 1}  ${v.title}`, bold: true, fontSize: 12 },
              { text: v.description, margin: [0, 4, 0, 6], fontSize: 10, color: '#444444' },
              {
                columns: [
                  { text: [{ text: 'Риск: ', color: '#888888' }, { text: `${v.risk}/10`, color, bold: true }], fontSize: 10 },
                  { text: [{ text: 'Штраф: ', color: '#888888' }, { text: v.fineText, bold: true }], fontSize: 10 },
                ],
                margin: [0, 0, 0, 4],
              },
              { text: [{ text: 'Основание: ', color: '#888888' }, { text: v.normBase }], fontSize: 9, margin: [0, 0, 0, 4] },
              { text: [{ text: 'Что сделать: ', color: '#888888' }, { text: v.solution }], fontSize: 10, bold: false, margin: [0, 0, 0, 4] },
              { text: `${v.free ? 'Бесплатно' : money(v.costMin)} · ${v.daysMin}${v.daysMax && v.daysMax !== v.daysMin ? '–' + v.daysMax : ''} дн.`, fontSize: 9, color: '#888888' },
            ],
          }]],
        },
        layout: { fillColor: () => '#FAFAFA', paddingLeft: () => 12, paddingRight: () => 10, paddingTop: () => 10, paddingBottom: () => 10 },
      },
    ],
  };
}

function roadmapBucket(title, items) {
  if (items.length === 0) return null;
  return {
    margin: [0, 4, 0, 12],
    stack: [
      { text: title, bold: true, margin: [0, 0, 0, 6], fontSize: 11 },
      { ul: items.map((v) => `${v.title} — ${v.free ? 'бесплатно' : money(v.costMin)}, ${v.daysMin} дн.`), fontSize: 10 },
    ],
  };
}

// Таблица с подложкой на заголовке и лёгкой зеброй на строках — читается
// быстрее, чем таблица без заливки (было раньше).
function styledTable(widths, headerRow, rows) {
  return {
    table: {
      widths,
      headerRows: 1,
      body: [headerRow.map((h) => ({ text: h, bold: true, color: '#FFFFFF', fontSize: 10 })), ...rows],
    },
    layout: {
      fillColor: (rowIndex) => (rowIndex === 0 ? '#2A2A2E' : rowIndex % 2 === 0 ? '#FAFAFA' : null),
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => '#EBEBEB',
      paddingTop: () => 6,
      paddingBottom: () => 6,
      paddingLeft: () => 8,
    },
  };
}

const TOC_SECTIONS = [
  'Резюме руководителя',
  'Карта уязвимостей',
  'Дорожная карта устранения',
  'Обязательные документы',
  'Дополнительные зоны внимания',
  'Персональные рекомендации',
  'Какие органы могут проверять бизнес',
  'Что делать дальше',
];

function tocPage() {
  return {
    stack: [
      { text: 'Содержание', style: 'sectionTitle', margin: [0, 0, 0, 20] },
      ...TOC_SECTIONS.map((t, i) => ({
        columns: [
          { text: `${i + 1}. ${t}`, fontSize: 12 },
          { text: '', fontSize: 12 }, // pdfmake не поддерживает leader dots нативно — раздел без номера страницы, ориентир по порядку.
        ],
        margin: [0, 0, 0, 10],
      })),
    ],
    pageBreak: 'after',
  };
}

function buildDocDefinition(report) {
  const { titlePage, summary, vulnerabilityMap, roadmap, mandatoryDocuments, attentionZones, recommendations, authorities, nextSteps, disclaimer } = report;

  const content = [
    // --- Титульный лист ---
    { text: 'БЕЗОПАСНЫЙ БИЗНЕС', style: 'brand', margin: [0, 110, 0, 0] },
    { text: 'Полный аудит безопасности бизнеса', fontSize: 15, color: '#666666', margin: [0, 6, 0, 40] },
    {
      table: {
        widths: ['auto', '*'],
        body: [
          ['Ниша', titlePage.niche],
          ['Форма работы', titlePage.legalForm],
          ['Дата формирования', titlePage.generatedAt.toLocaleDateString('ru-RU')],
          ['ID отчёта', titlePage.reportNumber],
        ].map((row) => [{ text: row[0], color: '#888888', fontSize: 10 }, { text: row[1], fontSize: 10 }]),
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 24],
    },
    {
      table: {
        widths: ['*'],
        body: [[{ text: `Статус безопасности: ${titlePage.zoneLabel}`, bold: true, fontSize: 13, color: ZONE_COLORS[titlePage.zone], border: [false, false, false, false], margin: [0, 2, 0, 2] }]],
      },
      layout: { fillColor: () => ZONE_BG[titlePage.zone], paddingLeft: () => 14, paddingRight: () => 14, paddingTop: () => 10, paddingBottom: () => 10 },
    },
    { text: 'Отчёт носит информационный характер и не является юридическим заключением.', fontSize: 9, italics: true, color: '#999999', margin: [0, 80, 0, 0] },
    { text: '', pageBreak: 'after' },

    tocPage(),

    // --- Резюме руководителя ---
    sectionHeader(1, 'Резюме руководителя'),
    styledTable(
      ['*', '*'],
      ['Показатель', 'Значение'],
      [
        [{ text: 'Статус бизнеса', fontSize: 10 }, { text: summary.zoneLabel, fontSize: 10, bold: true, color: ZONE_COLORS[titlePage.zone] }],
        [{ text: 'Индекс безопасности', fontSize: 10 }, { text: `${summary.indexPercent}%`, fontSize: 10, bold: true }],
        [{ text: 'Найдено нарушений', fontSize: 10 }, { text: String(summary.violationsCount), fontSize: 10 }],
        [{ text: 'Критических нарушений (риск 9–10)', fontSize: 10 }, { text: String(summary.criticalCount), fontSize: 10, color: summary.criticalCount > 0 ? '#c0392b' : undefined }],
        [{ text: 'Ориентировочные риски', fontSize: 10 }, { text: `до ${money(summary.estimatedFineMax)}`, fontSize: 10 }],
      ]
    ),
    { text: '', margin: [0, 14, 0, 0] },
    summary.worstViolation ? { text: [{ text: 'Самое опасное нарушение: ', color: '#888888' }, { text: summary.worstViolation.title, bold: true }], fontSize: 11, margin: [0, 0, 0, 4] } : null,
    summary.firstAction ? { text: [{ text: 'Первое действие: ', color: '#888888' }, { text: `${summary.firstAction.title} (срок: ${summary.firstAction.days} дн.)`, bold: true }], fontSize: 11, margin: [0, 0, 0, 14] } : null,

    { text: 'Общая карта безопасности', style: 'subheader', margin: [0, 10, 0, 8] },
    styledTable(
      ['*', 'auto', 'auto'],
      ['Блок', 'Баллы', 'Статус'],
      summary.blocks.map((b) => [
        { text: b.label, fontSize: 10 },
        { text: `${b.score}/${b.maxScore}`, fontSize: 10 },
        { text: b.zone === 'green' ? 'Зелёная' : b.zone === 'yellow' ? 'Жёлтая' : 'Красная', color: ZONE_COLORS[b.zone], bold: true, fontSize: 10 },
      ])
    ),

    summary.topThree.length > 0 ? { text: 'Три главные уязвимости', style: 'subheader', margin: [0, 20, 0, 10] } : null,
    ...summary.topThree.map((v, i) => violationBlock(v, i)),
    { text: '', pageBreak: 'after' },

    // --- Карта уязвимостей ---
    sectionHeader(2, 'Карта уязвимостей'),
    vulnerabilityMap.length === 0
      ? {
          stack: [
            { text: 'По результатам аудита критических нарушений не выявлено.', fontSize: 11 },
            { text: 'Однако отсутствие нарушений в рамках проверки не гарантирует отсутствие иных рисков бизнеса. Рекомендуем ознакомиться с разделом «Дополнительные зоны внимания».', fontSize: 10, color: '#666666', margin: [0, 6, 0, 0] },
          ],
        }
      : { stack: vulnerabilityMap.map((v, i) => violationBlock(v, i)) },
    { text: '', pageBreak: 'after' },

    // --- Дорожная карта устранения ---
    sectionHeader(3, 'Дорожная карта устранения'),
    roadmapBucket('Сделать сегодня (до 1 дня)', roadmap.today),
    roadmapBucket('Сделать за 7 дней', roadmap.week),
    roadmapBucket('Сделать за 14 дней', roadmap.twoWeeks),
    roadmapBucket('Сделать за 30 дней и далее', roadmap.month),
    roadmap.quickWins.length > 0
      ? {
          margin: [0, 6, 0, 14],
          table: {
            widths: ['*'],
            body: [[{
              border: [false, false, false, false],
              stack: [
                { text: 'Быстрые победы', bold: true, margin: [0, 0, 0, 4], fontSize: 11 },
                { text: 'Вы можете снизить уровень риска бизнеса уже сегодня.', fontSize: 9, color: '#666666', margin: [0, 0, 0, 6] },
                { ul: roadmap.quickWins.map((v) => `${v.solution} Стоимость: 0 ₽.`), fontSize: 10 },
              ],
            }]],
          },
          layout: { fillColor: () => '#EAFAF1', paddingLeft: () => 12, paddingRight: () => 10, paddingTop: () => 10, paddingBottom: () => 10 },
        }
      : null,
    { text: `Ориентировочный бюджет устранения нарушений: от ${money(roadmap.budgetMin)}`, bold: true, fontSize: 11, margin: [0, 8, 0, 2] },
    { text: 'Важно: расчёт предварительный и зависит от региона, подрядчиков и особенностей бизнеса.', fontSize: 9, italics: true, color: '#999999' },
    { text: '', pageBreak: 'after' },

    // --- Обязательные документы ---
    sectionHeader(4, 'Обязательные документы'),
    ...mandatoryDocuments.map((section) => ({
      margin: [0, 0, 0, 14],
      stack: [
        { text: section.title, bold: true, margin: [0, 0, 0, 6], fontSize: 11 },
        { ul: section.items, fontSize: 10 },
      ],
    })),
    { text: '', pageBreak: 'after' },

    // --- Дополнительные зоны внимания ---
    sectionHeader(5, 'Дополнительные зоны внимания'),
    { text: 'Данный аудит не охватывает абсолютно все возможные риски бизнеса. Ниже перечислены дополнительные направления, которые рекомендуется проверить отдельно.', fontSize: 10, color: '#666666', margin: [0, 0, 0, 14] },
    ...attentionZones.map((zone) => ({
      margin: [0, 0, 0, 12],
      table: {
        widths: ['*'],
        body: [[{
          border: [false, false, false, false],
          stack: [
            { text: zone.title, bold: true, fontSize: 11 },
            { text: zone.issue, fontSize: 10, margin: [0, 4, 0, 4] },
            { text: [{ text: 'Что проверить: ', color: '#888888' }, { text: zone.checkWhat }], fontSize: 10, margin: [0, 0, 0, 4] },
            { text: `Нормативная база: ${zone.normBase}`, fontSize: 9, italics: true, color: '#999999' },
          ],
        }]],
      },
      layout: { fillColor: () => '#FAFAFA', paddingLeft: () => 12, paddingRight: () => 10, paddingTop: () => 10, paddingBottom: () => 10 },
    })),
    { text: '', pageBreak: 'after' },

    // --- Персональные рекомендации ---
    sectionHeader(6, 'Персональные рекомендации'),
    { text: recommendations.mainVerdict, fontSize: 11, margin: [0, 0, 0, 14] },
    recommendations.topActions.length > 0
      ? { text: 'Что сделать в первую очередь', style: 'subheader', margin: [0, 0, 0, 8] }
      : null,
    { ul: recommendations.topActions.map((v) => `${v.title} (риск ${v.risk}/10) — ${v.solution}`), fontSize: 10, margin: [0, 0, 0, 14] },
    recommendations.freeFixes.length > 0
      ? {
          margin: [0, 0, 0, 14],
          stack: [
            { text: 'Что можно исправить без денег', style: 'subheader', margin: [0, 0, 0, 8] },
            { ul: recommendations.freeFixes.map((v) => v.solution), fontSize: 10 },
          ],
        }
      : null,
    recommendations.needsSpecialist.length > 0
      ? {
          margin: [0, 0, 0, 14],
          stack: [
            { text: 'Где может понадобиться помощь специалистов', style: 'subheader', margin: [0, 0, 0, 8] },
            { text: 'Часть выявленных вопросов может потребовать привлечения профильных специалистов. Это нормальная практика и не означает наличие серьёзных проблем в бизнесе.', fontSize: 9, color: '#666666', margin: [0, 0, 0, 6] },
            { ul: recommendations.needsSpecialist.map((v) => v.title), fontSize: 10 },
          ],
        }
      : null,
    {
      margin: [0, 0, 0, 14],
      text: `Прогноз: при выполнении мероприятий из первых двух блоков дорожной карты будет устранено ${recommendations.forecast.fixableCount} нарушений, уровень безопасности вырастет до ${recommendations.forecast.projectedPercent}%, количество критических рисков снизится с ${recommendations.forecast.criticalBefore} до ${recommendations.forecast.criticalAfter}.`,
      fontSize: 10,
    },
    { text: 'Рекомендации по управлению рисками', style: 'subheader', margin: [0, 0, 0, 8] },
    { text: recommendations.riskManagementText, fontSize: 10, margin: [0, 0, 0, 14] },
    {
      table: {
        widths: ['*'],
        body: [[{
          border: [false, false, false, false],
          stack: [
            { text: `Готовность к проверке: ${recommendations.readiness.label}`, bold: true, fontSize: 11 },
            { text: recommendations.readiness.text, fontSize: 10, margin: [0, 4, 0, 0] },
          ],
        }]],
      },
      layout: { fillColor: () => '#F7F7F7', paddingLeft: () => 12, paddingRight: () => 10, paddingTop: () => 10, paddingBottom: () => 10 },
    },
    { text: '', pageBreak: 'after' },

    // --- Какие органы могут проверять бизнес ---
    sectionHeader(7, 'Какие органы могут проверять бизнес'),
    ...authorities.map((a) => ({
      margin: [0, 0, 0, 12],
      stack: [
        { text: a.name, bold: true, fontSize: 11 },
        { text: [{ text: 'Что проверяет: ', color: '#888888' }, { text: a.checks }], fontSize: 10, margin: [0, 4, 0, 2] },
        { text: [{ text: 'Что обычно запрашивает: ', color: '#888888' }, { text: a.requests }], fontSize: 10 },
      ],
    })),

    // --- Что делать дальше ---
    sectionHeader(8, 'Что делать дальше'),
    { ol: nextSteps, fontSize: 11, margin: [0, 0, 0, 20] },

    // --- Дисклеймер ---
    { text: 'Дисклеймер', bold: true, fontSize: 10, color: '#999999', margin: [0, 20, 0, 6] },
    { text: disclaimer, fontSize: 8, color: '#999999' },
  ].filter(Boolean);

  return {
    content,
    defaultStyle: { font: 'DejaVuSans', fontSize: 10 },
    styles: {
      brand: { fontSize: 26, bold: true },
      sectionTitle: { fontSize: 18, bold: true },
      sectionHeader: { fontSize: 16, bold: true },
      subheader: { fontSize: 12, bold: true },
    },
    pageMargins: [40, 40, 40, 56],
    // Колонтитул — номер отчёта и страницы на каждой странице (не было
    // раньше вообще) — при распечатке отдельными листами понятно, что
    // к чему относится.
    footer: (currentPage, pageCount) => ({
      margin: [40, 12, 40, 0],
      columns: [
        { text: `«Безопасный бизнес» · Отчёт ${report.titlePage.reportNumber}`, fontSize: 7, color: '#AAAAAA' },
        { text: `${currentPage} / ${pageCount}`, fontSize: 7, color: '#AAAAAA', alignment: 'right' },
      ],
    }),
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
