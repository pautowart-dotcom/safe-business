// Экспорт журналов (Пакет 3, Этап 5) в печатаемый PDF — тот же механизм,
// что и отчёт безопасности (modules/security/report/pdf.js): pdfmake +
// встроенный DejaVu Sans (стандартные PDF-шрифты кириллицу не поддерживают).
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

// columns: [{ header, key }], rows: [{ [key]: string }] — значения уже
// отформатированы вызывающей стороной (даты, имена и т.п.).
function buildDocDefinition({ companyName, title, disclaimer, columns, rows }) {
  return {
    content: [
      { text: title, style: 'header' },
      { text: companyName, fontSize: 11, color: '#6B6B6B', margin: [0, 2, 0, 0] },
      { text: `Сформировано: ${new Date().toLocaleString('ru-RU')}`, fontSize: 9, color: '#6B6B6B', margin: [0, 2, 0, 16] },
      rows.length === 0
        ? { text: 'Записей пока нет.', margin: [0, 0, 0, 16] }
        : {
            table: {
              headerRows: 1,
              widths: columns.map(() => '*'),
              body: [columns.map((c) => ({ text: c.header, bold: true })), ...rows.map((r) => columns.map((c) => r[c.key] ?? '—'))],
            },
            margin: [0, 0, 0, 16],
          },
      { text: disclaimer, fontSize: 9, italics: true },
    ],
    defaultStyle: { font: 'DejaVuSans', fontSize: 10 },
    styles: { header: { fontSize: 16, bold: true } },
    pageMargins: [40, 40, 40, 40],
  };
}

function renderJournalPdf(data) {
  const printer = new PdfPrinter(FONTS);
  const doc = printer.createPdfKitDocument(buildDocDefinition(data));

  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

module.exports = { renderJournalPdf };
