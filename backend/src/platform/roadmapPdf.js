// PDF-версия персонального roadmap открытия бизнеса (продукт "с чего начать
// новичку"). pdfmake + DejaVu Sans — тот же выбор, что в
// modules/security/report/pdf.js (кириллица, свободная лицензия шрифта),
// не Puppeteer-бланки journalGenerator.js — там дизайн печатных бланков с
// повторяющимися строками таблиц, здесь обычный текстовый документ.
//
// Оформление (07.09.2026, владелец: "выглядит дёшево, сделай подороже, и
// карточки нарушений разъезжаются между страницами") — взял тот же язык,
// что уже есть в обычном PDF-отчёте теста безопасности (report/pdf.js):
// нумерованные значки-кружки у заголовков разделов, колонтитул с номером
// страницы, unbreakable-карточки (не режутся посередине разрывом страницы).
// Акцентный цвет — тот же индиго, что на лендинге (landing/index.html,
// --accent: #4f46e5), а не нейтральный графит из report/pdf.js — этот
// продукт не часть личного кабинета, у него нет своего "клиентского" цвета
// нигде ещё, логично взять цвет первого знакомства с брендом (лендинг).
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

const ACCENT = '#4f46e5';

// Нумерованный значок-кружок + заголовок — тот же приём, что уже в
// report/pdf.js (sectionHeader), просто параметризован размером кружка:
// крупный (22) для двух главных разделов документа, помельче (18) для
// заголовка каждой стадии — визуальная иерархия "раздел > стадия > пункт".
function badgeHeader(number, text, { size = 22, fontSize = 16, color = ACCENT, margin = [0, 16, 0, 8] } = {}) {
  return {
    margin,
    columns: [
      {
        width: size,
        table: { widths: [size], heights: [size], body: [[{ text: String(number), alignment: 'center', color: '#FFFFFF', bold: true, fontSize: size >= 22 ? 13 : 11, border: [false, false, false, false] }]] },
        layout: { fillColor: () => color, paddingTop: () => (size >= 22 ? 5 : 4) },
      },
      { width: 10, text: '' },
      { text, bold: true, fontSize, margin: [0, size >= 22 ? 2 : 1, 0, 0] },
    ],
  };
}

// Та же шкала и та же денежная подпись, что в обычном PDF-отчёте теста
// безопасности (modules/security/report/pdf.js) — не общий модуль ради
// десятка строк (тот же принцип, что уже используется в проекте, см.
// computePeriodRange в Finance.jsx/AiAdvisor.jsx на фронте).
const RISK_COLORS = [
  { min: 9, color: '#c0392b' },
  { min: 7, color: '#e67e22' },
  { min: 5, color: '#f1c40f' },
  { min: 0, color: '#27ae60' },
];
// Пункты регистрации юрформы (registrationSteps.js) не приходят из матрицы
// нарушений — у них нет risk вовсе (это не нарушение, а обычный шаг
// регистрации). Нейтральный серый вместо падения на find().color.
function riskColor(risk) {
  if (risk == null) return '#BBBBBB';
  return (RISK_COLORS.find((r) => risk >= r.min) || RISK_COLORS[RISK_COLORS.length - 1]).color;
}
function money(value) {
  if (value == null) return '—';
  return `${value.toLocaleString('ru-RU')} ₽`;
}

// 07.09.2026 (владелец: "карта плохая, за 1490₽ должна быть подробной, как
// обычный отчёт") — та же карточка нарушения, что в report/pdf.js
// (violationBlock): цветная полоса по риску, штраф, норма закона, пошаговая
// инструкция. unbreakable:true (владелец: "блоки расходятся между
// страницами") — карточка целиком переносится на следующую страницу, если
// не помещается на текущей, вместо разрыва посередине.
// Разделено на content (без unbreakable) + itemBlock (с unbreakable) —
// stageBlock ниже склеивает заголовок стадии с первым пунктом в один
// неразрывный блок, ему нужен именно content, чтобы не оборачивать
// unbreakable в unbreakable.
function itemBlockContent(item) {
  const color = riskColor(item.risk);
  return {
    margin: [0, 0, 0, 10],
    columns: [
      { width: 4, table: { widths: [4], heights: [1], body: [[{ text: '', border: [false, false, false, false] }]] }, layout: { fillColor: () => color } },
      {
        width: '*',
        table: {
          widths: ['*'],
          body: [[{
            border: [false, false, false, false],
            stack: [
              { text: item.title, bold: true, fontSize: 12 },
              item.description ? { text: item.description, margin: [0, 4, 0, 6], fontSize: 10, color: '#444444' } : null,
              {
                columns: [
                  item.risk != null ? { text: [{ text: 'Риск: ', color: '#888888' }, { text: `${item.risk}/10`, color, bold: true }], fontSize: 10 } : { text: '' },
                  item.fineText ? { text: [{ text: 'Штраф: ', color: '#888888' }, { text: item.fineText, bold: true }], fontSize: 10 } : { text: '' },
                ],
                margin: [0, 0, 0, 4],
              },
              item.normBase ? { text: [{ text: 'Основание: ', color: '#888888' }, { text: item.normBase }], fontSize: 9, margin: [0, 0, 0, 4] } : null,
              item.solution ? { text: [{ text: 'Что сделать: ', color: '#888888' }, { text: item.solution }], fontSize: 10, margin: [0, 0, 0, item.howTo?.length > 0 ? 6 : 4] } : null,
              item.howTo?.length > 0
                ? { margin: [0, 0, 0, 6], ol: item.howTo.map((step) => ({ text: step, fontSize: 9, color: '#333333', margin: [0, 0, 0, 3] })) }
                : null,
              (() => {
                const costPart = item.free ? 'Бесплатно' : item.costMin != null ? money(item.costMin) : null;
                const durationPart = item.durationNote ? `Срок: ${item.durationNote}` : null;
                const footer = [costPart, durationPart].filter(Boolean).join(' · ');
                return footer ? { text: footer, fontSize: 9, color: '#888888' } : null;
              })(),
            ].filter(Boolean),
          }]],
        },
        layout: { fillColor: () => '#FAFAFA', paddingLeft: () => 12, paddingRight: () => 10, paddingTop: () => 10, paddingBottom: () => 10 },
      },
    ],
  };
}

function itemBlock(item) {
  return { unbreakable: true, ...itemBlockContent(item) };
}

function stageBlock(stage, index) {
  const header = badgeHeader(index + 1, stage.title, { size: 18, fontSize: 13, color: '#1a1a1a', margin: [0, 4, 0, 10] });
  const [firstItem, ...restItems] = stage.items;
  if (!firstItem) return { margin: [0, 0, 0, 14], stack: [header] };
  return {
    margin: [0, 0, 0, 14],
    stack: [
      // Заголовок стадии + первый пункт — один неразрывный блок (07.09.2026,
      // владелец: заголовок сиротой оставался внизу страницы, а весь первый
      // пункт целиком уезжал на следующую — unbreakable у самой карточки
      // этого не чинит, он не знает про соседний заголовок).
      { unbreakable: true, stack: [header, itemBlockContent(firstItem)] },
      ...restItems.map((item) => itemBlock(item)),
    ],
  };
}

function buildDocDefinition(roadmap) {
  const { nicheLabel, legalFormLabel, generatedAt, stages, disclaimer } = roadmap;

  const content = [
    // 07.09.2026: раньше титульный блок жил на отдельной странице
    // (pageBreak: 'after' сразу за ним) — почти пустая страница 1 (только
    // заголовок и три строки текста) выглядела недоделанной для платного
    // PDF. Убрали принудительный разрыв — интро теперь просто первый блок
    // страницы 1, дальше сразу идёт сам чек-лист, без отдельной "обложки".
    { text: 'Безопасный Бизнес', style: 'brand', margin: [0, 30, 0, 0] },
    // Цветная линия-акцент под заголовком — единственный графический
    // элемент обложки, не требует новых зависимостей (canvas уже есть в
    // pdfmake из коробки, как и в report/pdf.js — progressBar/timeline).
    { canvas: [{ type: 'rect', x: 0, y: 0, w: 60, h: 4, r: 2, color: ACCENT }], margin: [0, 6, 0, 14] },
    { text: 'Roadmap открытия бизнеса', fontSize: 16, margin: [0, 0, 0, 20] },
    { text: `Ниша: ${nicheLabel}` },
    { text: `Форма работы: ${legalFormLabel}` },
    { text: `Дата формирования: ${generatedAt.toLocaleDateString('ru-RU')}` },
    { text: 'Не всё нужно делать одновременно — двигайтесь по стадиям в указанном порядке.', bold: true, margin: [0, 10, 0, 0] },
    { text: 'Документ носит информационный характер и не является юридической консультацией.', fontSize: 9, italics: true, margin: [0, 10, 0, 20] },

    badgeHeader('P', 'Roadmap по стадиям'),
    ...stages.map((stage, i) => stageBlock(stage, i)),

    badgeHeader('!', 'Дисклеймер'),
    { text: disclaimer, fontSize: 9 },
    { text: `Дата формирования: ${generatedAt.toLocaleDateString('ru-RU')}`, fontSize: 9, margin: [0, 10, 0, 0] },
  ];

  return {
    content,
    defaultStyle: { font: 'DejaVuSans', fontSize: 10 },
    styles: {
      brand: { fontSize: 26, bold: true, color: ACCENT },
    },
    pageMargins: [40, 40, 40, 56],
    // Колонтитул — бренд и номер страницы на каждой странице, тот же приём,
    // что в обычном PDF-отчёте (report/pdf.js) — раньше здесь колонтитула
    // не было вообще, ни одной подсказки, что к чему относится при печати
    // отдельными листами.
    footer: (currentPage, pageCount) => ({
      margin: [40, 12, 40, 0],
      columns: [
        { text: `«Безопасный бизнес» · Roadmap · ${nicheLabel}`, fontSize: 7, color: '#AAAAAA' },
        { text: `${currentPage} / ${pageCount}`, fontSize: 7, color: '#AAAAAA', alignment: 'right' },
      ],
    }),
  };
}

function renderRoadmapPdf(roadmap) {
  const printer = new PdfPrinter(FONTS);
  const doc = printer.createPdfKitDocument(buildDocDefinition(roadmap));

  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

module.exports = { renderRoadmapPdf };
