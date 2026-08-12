// Заполнение шаблона данными + рендер в PDF. Тот же PdfPrinter/шрифт
// DejaVuSans, что и в modules/security/report/pdf.js и platform/roadmapPdf.js —
// уже проверенное решение для кириллицы, не заводим второй способ.
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

// {{field}} → data[field], пустое значение необязательного поля печатается
// как "—" (не оставляем документ с дырой вида "ИНН , ОГРНИП 123") — сами
// поля-заполнители задаются в content/templates/*.js (fields), не здесь.
function fillTemplate(body, data) {
  return body.replace(/{{(\w+)}}/g, (_, key) => {
    const value = data[key];
    return value === undefined || value === null || value === '' ? '—' : String(value);
  });
}

// body — абзацы через пустую строку, "# " в начале строки — заголовок раздела
// (см. content/templates/manicure.js). Простой формат, а не HTML/markdown —
// шаблонов немного и они текстовые, разбирать полноценный markdown незачем.
function bodyToPdfContent(filledBody) {
  return filledBody
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (block.startsWith('# ')) {
        return { text: block.slice(2).trim(), style: 'sectionHeader', margin: [0, 14, 0, 6] };
      }
      return { text: block, margin: [0, 0, 0, 8] };
    });
}

function draftNotice(template) {
  if (template.status === 'reviewed') return null;
  return {
    text: 'Черновик — этот документ ещё не проверен юристом. Не гарантирует прохождение проверки или суда.',
    style: 'draftNotice',
    margin: [0, 0, 0, 16],
  };
}

function renderDocumentPdf({ template, data, generatedAt }) {
  const filledBody = fillTemplate(template.body, data);
  const content = [
    draftNotice(template),
    ...bodyToPdfContent(filledBody),
    {
      text: `Документ сформирован автоматически в сервисе «Безопасный бизнес» ${generatedAt.toLocaleDateString('ru-RU')} по шаблону «${template.title}» (версия ${template.version}). Сервис не заменяет юриста.`,
      style: 'footer',
      margin: [0, 24, 0, 0],
    },
  ].filter(Boolean);

  const printer = new PdfPrinter(FONTS);
  const doc = printer.createPdfKitDocument({
    content,
    defaultStyle: { font: 'DejaVuSans', fontSize: 11 },
    styles: {
      sectionHeader: { fontSize: 13, bold: true },
      draftNotice: { fontSize: 10, bold: true, color: '#B7950B' },
      footer: { fontSize: 8, italics: true, color: '#888888' },
    },
    pageMargins: [50, 50, 50, 50],
  });

  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

module.exports = { fillTemplate, renderDocumentPdf };
