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
// Значения полей — то, что пользователь ввёл в форму (ИНН, адрес, телефон и
// т.п.), однострочные по смыслу. bodyToPdfContent ниже разбивает body на
// блоки/заголовки/списки ПОСЛЕ подстановки — если бы значение поля содержало
// "\n\n# ..." или "\n\n- ...", оно превратилось бы в поддельный раздел или
// список внутри официального документа (владелец компании мог бы вписать в
// поле формы лишний текст, который в PDF выглядел бы как часть проверенного
// юристом шаблона). Схлопываем переносы строк в значении, чтобы подстановка
// никогда не создавала новый блок — сам шаблон (body) при этом не трогаем.
function sanitizeFieldValue(value) {
  return String(value).replace(/\r\n|\r|\n/g, ' ').trim();
}

function fillTemplate(body, data) {
  return body.replace(/{{(\w+)}}/g, (_, key) => {
    const value = data[key];
    return value === undefined || value === null || value === '' ? '—' : sanitizeFieldValue(value);
  });
}

// body — абзацы через пустую строку (см. content/templates/manicure.js):
//   "# "  в начале строки — заголовок раздела (нумерация — часть текста
//         самого шаблона, "# 1. Исполнитель", а не считается кодом);
//   "- "  в начале КАЖДОЙ строки блока — маркированный список;
//   иначе — обычный абзац, выравнивается по ширине (justify), как в
//         печатных договорах, а не рваным правым краем.
// Простой формат, а не HTML/markdown — шаблонов немного и они текстовые,
// разбирать полноценный markdown незачем.
function bodyToPdfContent(filledBody) {
  return filledBody
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (block.startsWith('# ')) {
        return {
          margin: [0, 18, 0, 8],
          stack: [
            { text: block.slice(2).trim(), style: 'sectionHeader' },
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 0.75, lineColor: '#CBB07A' }], margin: [0, 4, 0, 0] },
          ],
        };
      }
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length > 0 && lines.every((l) => l.startsWith('- '))) {
        return { ul: lines.map((l) => l.slice(2).trim()), margin: [0, 0, 0, 8], alignment: 'justify' };
      }
      return { text: block, margin: [0, 0, 0, 8], alignment: 'justify', lineHeight: 1.25 };
    });
}

// Выделенный блок вместо строки жёлтого текста — заметнее в распечатанном
// виде (жёлтый текст на белом плохо читается на плохом принтере/ксероксе,
// заливка + рамка видны даже в ч/б).
function draftNotice(template) {
  if (template.status === 'reviewed') return null;
  return {
    table: {
      widths: ['*'],
      body: [[{
        text: 'ЧЕРНОВИК. Этот документ ещё не проверен юристом сервиса «Безопасный бизнес». Не гарантирует прохождение проверки или суда — используйте на свой риск.',
        style: 'draftNotice',
        border: [false, false, false, false],
      }]],
    },
    layout: { fillColor: '#FCF3CF', paddingLeft: () => 12, paddingRight: () => 12, paddingTop: () => 10, paddingBottom: () => 10 },
    margin: [0, 0, 0, 20],
  };
}

function titleBlock(template, generatedAt) {
  return {
    margin: [0, 0, 0, 4],
    stack: [
      { text: template.title.toUpperCase(), style: 'docTitle', alignment: 'center' },
      { text: `Дата формирования: ${generatedAt.toLocaleDateString('ru-RU')}`, style: 'docSubtitle', alignment: 'center' },
    ],
  };
}

function renderDocumentPdf({ template, data, generatedAt }) {
  const filledBody = fillTemplate(template.body, data);
  const content = [
    titleBlock(template, generatedAt),
    draftNotice(template),
    ...bodyToPdfContent(filledBody),
  ].filter(Boolean);

  const printer = new PdfPrinter(FONTS);
  const doc = printer.createPdfKitDocument({
    content,
    defaultStyle: { font: 'DejaVuSans', fontSize: 11 },
    styles: {
      docTitle: { fontSize: 18, bold: true },
      docSubtitle: { fontSize: 9, color: '#888888', margin: [0, 4, 0, 0] },
      sectionHeader: { fontSize: 13, bold: true },
      draftNotice: { fontSize: 10, bold: true, color: '#7D6608' },
    },
    pageMargins: [56, 60, 56, 56],
    // Одна и та же подпись служебной генерации на каждой странице внизу —
    // не теряется, если документ распечатают отдельными листами (в отличие
    // от футера-абзаца в конце текста, который был только на последней
    // странице).
    footer: (currentPage, pageCount) => ({
      margin: [56, 10, 56, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 483, y2: 0, lineWidth: 0.5, lineColor: '#DDDDDD' }] },
        {
          columns: [
            { text: `Сформировано автоматически в сервисе «Безопасный бизнес» по шаблону «${template.title}», версия ${template.version}. Сервис не заменяет юриста.`, fontSize: 7, italics: true, color: '#999999' },
            { text: `${currentPage} / ${pageCount}`, fontSize: 7, color: '#999999', alignment: 'right', width: 40 },
          ],
          margin: [0, 4, 0, 0],
        },
      ],
    }),
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
