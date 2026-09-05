// Заполнение шаблона данными + рендер в PDF.
//
// Оформление (12.08.2026) — по ГОСТ Р 7.0.97-2016 "Требования к оформлению
// документов": шрифт из рекомендованных стандартом (Times New Roman —
// используем DejaVu Serif, тот же принцип, что и DejaVu Sans в
// modules/security/report/pdf.js и platform/roadmapPdf.js: свободный,
// со встроенной кириллицей, тот же npm-пакет dejavu-fonts-ttf уже
// содержит и Serif-начертания, новая зависимость не нужна), поля страницы
// (слева больше — под подшивку, стандартная практика для официальных
// документов), межстрочный интервал 1.3, абзацный отступ у обычного
// текста. Раньше был обычный Sans-шрифт без отступов и с цветными
// декоративными линиями под заголовками разделов — выглядело как экран
// приложения, а не как документ (замечание владельца 12.08.2026).
const path = require('path');
const PdfPrinter = require('pdfmake/src/printer');
const { isVisible } = require('../../core/profileVisibility');

const FONT_DIR = path.dirname(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'));
const FONTS = {
  DejaVuSerif: {
    normal: path.join(FONT_DIR, 'DejaVuSerif.ttf'),
    bold: path.join(FONT_DIR, 'DejaVuSerif-Bold.ttf'),
    italics: path.join(FONT_DIR, 'DejaVuSerif-Italic.ttf'),
    bolditalics: path.join(FONT_DIR, 'DejaVuSerif-BoldItalic.ttf'),
  },
  DejaVuSans: {
    normal: path.join(FONT_DIR, 'DejaVuSans.ttf'),
    bold: path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'),
    italics: path.join(FONT_DIR, 'DejaVuSans-Oblique.ttf'),
    bolditalics: path.join(FONT_DIR, 'DejaVuSans-BoldOblique.ttf'),
  },
};

// Поля страницы в мм → pt (1 мм = 2.83465 pt), по ГОСТ Р 7.0.97-2016:
// левое/верхнее/нижнее — не менее 20 мм, правое — 10 мм. Левое взято с
// запасом (30 мм) — стандартная практика для документов, которые могут
// подшиваться. Нижнее увеличено под футер (номер страницы + подпись сервиса).
const MM = 2.83465;
const PAGE_MARGINS = [Math.round(30 * MM), Math.round(20 * MM), Math.round(15 * MM), Math.round(24 * MM)];

// Абзацный отступ 1.25 см (ГОСТ) — у pdfmake нет свойства "отступ первой
// строки" для простого текстового блока, имитируем неразрывными пробелами
// в начале абзаца. Только для обычных абзацев — не для заголовков и списков.
const FIRST_LINE_INDENT = '        ';

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

// 05.09.2026 — вместо переписывания целого документа под каждое сочетание
// юрформы/модели работы (владелец: "сотни, а может и тысячи вариантов
// шаблонов"), документ собирается из пунктов (clauses) с тем же условием
// показа, что уже используется в тесте безопасности (core/profileVisibility.js,
// PREDICATES). Юрист проверяет пункты (их десятки), не готовые комбинации.
// template.body (старый формат — один сплошной текст) продолжает работать
// без изменений: ничего не мигрируем принудительно, оба формата сосуществуют.
function assembleBody(template, profile) {
  if (!template.clauses) return template.body;
  return template.clauses
    .filter((c) => isVisible(c.showIf, profile))
    .map((c) => c.text)
    .join('\n\n');
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
//   иначе — обычный абзац, выравнивается по ширине (justify) с абзацным
//         отступом первой строки, как в печатных договорах.
// Простой формат, а не HTML/markdown — шаблонов немного и они текстовые,
// разбирать полноценный markdown незачем.
function bodyToPdfContent(filledBody) {
  return filledBody
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (block.startsWith('# ')) {
        // Без декоративной цветной линии (была раньше) — простой жирный
        // заголовок, как в официальных документах, не как разделитель
        // секций веб-интерфейса.
        return { text: block.slice(2).trim(), style: 'sectionHeader', margin: [0, 16, 0, 8] };
      }
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length > 0 && lines.every((l) => l.startsWith('- '))) {
        return { ul: lines.map((l) => l.slice(2).trim()), margin: [0, 0, 0, 10], alignment: 'justify' };
      }
      // Многострочные "карточки" реквизитов (например, блок исполнителя с
      // ИНН/адресом на отдельных строках) — не абзац сплошным текстом,
      // отступ первой строки им не идёт, оставляем как есть.
      if (lines.length > 1) {
        return { text: block, margin: [0, 0, 0, 10], lineHeight: 1.3 };
      }
      return { text: `${FIRST_LINE_INDENT}${block}`, margin: [0, 0, 0, 10], alignment: 'justify', lineHeight: 1.3 };
    });
}

function draftNotice(template) {
  if (template.status === 'reviewed') return null;
  return {
    table: {
      widths: ['*'],
      body: [[{
        text: 'БЕТА-ВЕРСИЯ ШАБЛОНА. Дорабатывается и уточняется сервисом «Безопасный бизнес». Не является юридической консультацией и не гарантирует прохождение проверки или суда.',
        style: 'draftNotice',
        border: [false, false, false, false],
      }]],
    },
    layout: { fillColor: '#FCF3CF', paddingLeft: () => 12, paddingRight: () => 12, paddingTop: () => 10, paddingBottom: () => 10 },
    margin: [0, 0, 0, 22],
  };
}

// Заголовок документа — по образцу гражданско-правовых договоров/оферт:
// название по центру прописными, ниже дата составления. Одна тонкая линия
// отделяет "шапку" от текста документа (одна на весь документ, не по
// заголовку каждого раздела, как было раньше).
function titleBlock(template, generatedAt) {
  return {
    margin: [0, 0, 0, 18],
    stack: [
      { text: template.title.toUpperCase(), style: 'docTitle', alignment: 'center' },
      { text: `Дата составления: ${generatedAt.toLocaleDateString('ru-RU')}`, style: 'docSubtitle', alignment: 'center', margin: [0, 6, 0, 14] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 595 - PAGE_MARGINS[0] - PAGE_MARGINS[2], y2: 0, lineWidth: 0.75, lineColor: '#BBBBBB' }] },
    ],
  };
}

function renderDocumentPdf({ template, data, generatedAt, profile }) {
  const filledBody = fillTemplate(assembleBody(template, profile || {}), data);
  const content = [
    titleBlock(template, generatedAt),
    draftNotice(template),
    ...bodyToPdfContent(filledBody),
  ].filter(Boolean);

  const printer = new PdfPrinter(FONTS);
  const doc = printer.createPdfKitDocument({
    content,
    defaultStyle: { font: 'DejaVuSerif', fontSize: 12 },
    styles: {
      docTitle: { fontSize: 16, bold: true },
      docSubtitle: { fontSize: 10, color: '#555555' },
      sectionHeader: { fontSize: 13, bold: true },
      draftNotice: { font: 'DejaVuSans', fontSize: 10, bold: true, color: '#7D6608' },
    },
    pageMargins: PAGE_MARGINS,
    // Футер — служебная подпись сервиса, не часть самого документа, поэтому
    // намеренно другим (более мелким рубленым) шрифтом — читается как
    // "сноска платформы", а не как продолжение официального текста.
    footer: (currentPage, pageCount) => ({
      margin: [PAGE_MARGINS[0], 8, PAGE_MARGINS[2], 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 595 - PAGE_MARGINS[0] - PAGE_MARGINS[2], y2: 0, lineWidth: 0.5, lineColor: '#DDDDDD' }] },
        {
          columns: [
            { text: `Сформировано автоматически в сервисе «Безопасный бизнес» по шаблону «${template.title}», версия ${template.version}. Сервис не заменяет юриста.`, font: 'DejaVuSans', fontSize: 7, italics: true, color: '#999999' },
            { text: `${currentPage} / ${pageCount}`, font: 'DejaVuSans', fontSize: 7, color: '#999999', alignment: 'right', width: 40 },
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

module.exports = { fillTemplate, renderDocumentPdf, assembleBody };
