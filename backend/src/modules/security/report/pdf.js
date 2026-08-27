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

// Горизонтальный индикатор-шкала (26.08.2026, "следующий уровень" по
// прямой просьбе владельца — раньше статус был просто цветной текст в
// плашке, теперь визуальная метрика на обложке). Через canvas, не svg —
// svg-to-pdfkit не установлен как зависимость, а rect с r (радиус угла)
// в canvas хватает для скруглённой шкалы без новой зависимости.
function progressBar(percent, color, width, height) {
  const filled = Math.max(0, Math.min(width, (width * percent) / 100));
  return {
    canvas: [
      { type: 'rect', x: 0, y: 0, w: width, h: height, r: height / 2, color: '#EBEBEB' },
      ...(filled > 0 ? [{ type: 'rect', x: 0, y: 0, w: filled, h: height, r: height / 2, color }] : []),
    ],
  };
}

function pluralItems(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'пункт';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'пункта';
  return 'пунктов';
}

// Визуальный таймлайн дорожной карты — линия + узел на каждый срок,
// подписи с количеством пунктов под ней. Ширина подобрана под контентную
// область страницы (595pt A4 - 40pt поля с каждой стороны = 515, оставляем
// запас).
function roadmapTimeline(buckets) {
  const width = 460;
  const n = buckets.length;
  const step = width / (n - 1);
  const y = 7;
  const elements = [{ type: 'line', x1: 0, y1: y, x2: width, y2: y, lineWidth: 2, lineColor: '#DDDDDD' }];
  buckets.forEach((b, i) => {
    elements.push({ type: 'ellipse', x: i * step, y, r1: 6, r2: 6, color: b.count > 0 ? '#2A2A2E' : '#CCCCCC' });
  });
  return {
    margin: [0, 4, 0, 18],
    stack: [
      { canvas: elements },
      {
        margin: [0, 6, 0, 0],
        columns: buckets.map((b) => ({
          width: '*',
          alignment: 'center',
          text: [
            { text: `${b.label}\n`, bold: true, fontSize: 9 },
            { text: `${b.count} ${pluralItems(b.count)}`, fontSize: 8, color: '#888888' },
          ],
        })),
      },
    ],
  };
}

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
              { text: [{ text: 'Что сделать: ', color: '#888888' }, { text: v.solution }], fontSize: 10, bold: false, margin: [0, 0, 0, v.howTo && v.howTo.length > 0 ? 6 : 4] },
              v.howTo && v.howTo.length > 0
                ? {
                    margin: [0, 0, 0, 6],
                    ol: v.howTo.map((step) => ({ text: step, fontSize: 9, color: '#333333', margin: [0, 0, 0, 3] })),
                  }
                : null,
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
  'Если вас уже оштрафовали',
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
  const { titlePage, summary, vulnerabilityMap, roadmap, mandatoryDocuments, attentionZones, recommendations, authorities, nextSteps, whatIfFined, platformBridge, disclaimer } = report;

  const content = [
    // --- Титульный лист ---
    { text: 'БЕЗОПАСНЫЙ БИЗНЕС', style: 'brand', margin: [0, 90, 0, 0] },
    { text: 'Полный аудит безопасности бизнеса', fontSize: 15, color: '#666666', margin: [0, 6, 0, 36] },
    {
      columns: [
        {
          width: 170,
          stack: [
            { text: `${summary.indexPercent}%`, fontSize: 40, bold: true, color: ZONE_COLORS[titlePage.zone] },
            { text: 'Индекс безопасности', fontSize: 9, color: '#888888', margin: [0, 0, 0, 10] },
            progressBar(summary.indexPercent, ZONE_COLORS[titlePage.zone], 150, 12),
            { text: titlePage.zoneLabel, bold: true, fontSize: 11, color: ZONE_COLORS[titlePage.zone], margin: [0, 8, 0, 0] },
          ],
        },
        {
          width: '*',
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
        },
      ],
      margin: [0, 0, 0, 30],
    },
    { text: 'Отчёт носит информационный характер и не является юридическим заключением.', fontSize: 9, italics: true, color: '#999999', margin: [0, 74, 0, 0] },
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
    roadmapTimeline([
      { label: 'Сегодня', count: roadmap.today.length },
      { label: '7 дней', count: roadmap.week.length },
      { label: '14 дней', count: roadmap.twoWeeks.length },
      { label: '30 дней', count: roadmap.month.length },
    ]),
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

    // --- Если вас уже оштрафовали ---
    sectionHeader(8, 'Если вас уже оштрафовали'),
    { text: 'Общий порядок действий, если проверка уже была и штраф уже выписан.', fontSize: 10, color: '#666666', margin: [0, 0, 0, 14] },
    ...whatIfFined.map((step, i) => ({
      margin: [0, 0, 0, 10],
      stack: [
        { text: `${i + 1}. ${step.title}`, bold: true, fontSize: 11 },
        { text: step.text, fontSize: 10, color: '#444444', margin: [0, 3, 0, 0] },
      ],
    })),
    { text: '', pageBreak: 'after' },

    // --- Что делать дальше ---
    sectionHeader(9, 'Что делать дальше'),
    { ol: nextSteps, fontSize: 11, margin: [0, 0, 0, 20] },
    {
      margin: [0, 0, 0, 14],
      table: {
        widths: ['*'],
        body: [[{
          border: [false, false, false, false],
          stack: [
            { text: platformBridge.intro, fontSize: 10, margin: [0, 0, 0, 8] },
            ...platformBridge.links.map((l) => ({ text: [{ text: '→ ', color: '#888888' }, { text: `${l.label}: `, bold: true }, { text: l.url, color: '#2A2A2E' }], fontSize: 10, margin: [0, 0, 0, 4] })),
          ],
        }]],
      },
      layout: { fillColor: () => '#F7F7F7', paddingLeft: () => 12, paddingRight: () => 10, paddingTop: () => 10, paddingBottom: () => 10 },
    },

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
