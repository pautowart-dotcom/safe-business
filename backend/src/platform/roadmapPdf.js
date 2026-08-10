// PDF-версия персонального roadmap открытия бизнеса (продукт "с чего начать
// новичку"). pdfmake + DejaVu Sans — тот же выбор, что в
// modules/security/report/pdf.js (кириллица, свободная лицензия шрифта),
// не Puppeteer-бланки journalGenerator.js — там дизайн печатных бланков с
// повторяющимися строками таблиц, здесь обычный текстовый документ.
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

function sectionHeader(text) {
  return { text, style: 'sectionHeader', margin: [0, 16, 0, 8] };
}

function stageBlock(stage) {
  return {
    margin: [0, 0, 0, 14],
    stack: [
      { text: stage.title, style: 'stageTitle' },
      ...stage.items.map((item) => ({
        margin: [0, 6, 0, 0],
        stack: [
          { text: item.title, bold: true },
          item.description ? { text: item.description } : null,
          item.durationNote ? { text: `Срок: ${item.durationNote}`, italics: true, color: '#555555' } : null,
        ].filter(Boolean),
      })),
    ],
  };
}

function buildDocDefinition(roadmap) {
  const { nicheLabel, legalFormLabel, generatedAt, stages, disclaimer } = roadmap;

  const content = [
    { text: 'Безопасный Бизнес', style: 'brand', margin: [0, 120, 0, 0] },
    { text: 'Roadmap открытия бизнеса', fontSize: 16, margin: [0, 4, 0, 30] },
    { text: `Ниша: ${nicheLabel}` },
    { text: `Форма работы: ${legalFormLabel}` },
    { text: `Дата формирования: ${generatedAt.toLocaleDateString('ru-RU')}` },
    { text: 'Не всё нужно делать одновременно — двигайтесь по неделям в указанном порядке.', bold: true, margin: [0, 10, 0, 0] },
    { text: 'Документ носит информационный характер и не является юридической консультацией.', fontSize: 9, italics: true, margin: [0, 60, 0, 0] },
    { text: '', pageBreak: 'after' },

    sectionHeader('Roadmap по неделям'),
    ...stages.map((stage) => stageBlock(stage)),

    sectionHeader('Дисклеймер'),
    { text: disclaimer, fontSize: 9 },
    { text: `Дата формирования: ${generatedAt.toLocaleDateString('ru-RU')}`, fontSize: 9, margin: [0, 10, 0, 0] },
  ];

  return {
    content,
    defaultStyle: { font: 'DejaVuSans', fontSize: 10 },
    styles: {
      brand: { fontSize: 26, bold: true },
      sectionHeader: { fontSize: 16, bold: true },
      stageTitle: { fontSize: 13, bold: true, color: '#1a1a1a' },
    },
    pageMargins: [40, 40, 40, 40],
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
