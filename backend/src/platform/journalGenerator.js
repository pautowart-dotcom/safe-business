// Пакет 4, Этап 3: сборка персонального печатного PDF-журнала из готовых
// HTML/CSS-шаблонов в assets/journal-templates/ (см. readme.txt там) —
// номер журнала и QR-код встраиваются в зарезервированное место на обложке,
// остальной дизайн не трогаем.
//
// Каждая страница шаблона рендерится ОТДЕЛЬНЫМ вызовом Puppeteer (а не
// склеивается в один HTML-документ) и затем страницы сшиваются в один PDF
// через pdf-lib. Это дороже по числу рендеров, зато полностью исключает
// утечку стилей между страницами (у cover.html/back_cover.html и обычных
// страниц разные :root-переменные с одинаковыми именами — --cream и др.,
// см. base.css и cover.html — при склейке в один документ они бы
// схлопнулись в одно значение и перекрасили все страницы).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');

const TEMPLATES_DIR = path.join(__dirname, '../../../assets/journal-templates');

// pageSizeMm — [ширина, высота] в мм, совпадает с @page{size:...} в
// source/*.html каждого типа (см. readme.txt: A5/A4, альбомная).
// pages — порядок страниц журнала. Строка — статичная страница как есть,
// {template} — многостраничный раздел: реальное число повторов не хранится
// здесь, а считается по количеству уже приложенных примеров (page_log_01.html
// и т.п.) в самой папке шаблона — так число страниц раздела задаёт дизайнер
// шаблона, а не наш код.
// pagesLifespanMonths — Пакет 4, Этап 4: грубая оценка "на сколько обычно
// хватает" готового бланка при обычной интенсивности использования, задана
// вручную для каждого типа (docs/task-batch-4.txt прямо запрещает пытаться
// вычислить точно — без цифрового дублирования узнать реальный расход
// страниц нельзя). УФ-лампа/стерилизаторы/предстерилизационная — минимум по
// 1-2 записи в рабочий день, страницы уходят быстрее; инструктаж и
// дезсредства — реже, одного бланка хватает дольше.
const JOURNAL_TYPES = [
  {
    key: 'uf_lamp', folder: 'uf-lamp', label: 'Журнал УФ-бактерицидной установки', numberPrefix: 'УФ',
    pageSizeMm: [210, 148], pagesLifespanMonths: 6,
    pages: ['cover.html', 'page02.html', 'page02b.html', 'page03.html', 'page04.html', { template: 'page_daily_template.html' }, 'back_cover.html'],
  },
  {
    key: 'sterilizers', folder: 'sterilizers', label: 'Журнал контроля работы стерилизаторов', numberPrefix: 'СТ',
    pageSizeMm: [297, 210], pagesLifespanMonths: 6,
    pages: ['cover.html', 'page02.html', { template: 'page_log_template.html' }, 'back_cover.html'],
  },
  {
    key: 'pre_sterilization', folder: 'pre-sterilization', label: 'Журнал предстерилизационной обработки', numberPrefix: 'ПС',
    pageSizeMm: [297, 210], pagesLifespanMonths: 6,
    pages: ['cover.html', 'page02.html', { template: 'page_log_template.html' }, 'back_cover.html'],
  },
  {
    key: 'instruktazh', folder: 'instruktazh', label: 'Журнал регистрации инструктажа', numberPrefix: 'ИН',
    pageSizeMm: [297, 210], pagesLifespanMonths: 12,
    pages: ['cover.html', 'page02.html', { template: 'page_log_template.html' }, 'back_cover.html'],
  },
  {
    key: 'disinfectants', folder: 'disinfectants', label: 'Книга учёта дезинфицирующих средств', numberPrefix: 'ДЗ',
    pageSizeMm: [297, 210], pagesLifespanMonths: 9,
    pages: [
      'cover.html', 'page02.html', 'page03.html',
      { template: 'page_raschet_template.html' },
      { template: 'page_prihod_template.html' },
      { template: 'page_rashod_template.html' },
      'back_cover.html',
    ],
  },
];
const JOURNAL_TYPE_BY_KEY = Object.fromEntries(JOURNAL_TYPES.map((t) => [t.key, t]));

function templateSourceDir(folder) {
  return path.join(TEMPLATES_DIR, folder, 'source');
}

// Дизайн для типа готов, если в assets/journal-templates/<folder>/source/
// действительно лежат HTML-файлы (а не только README-заглушка) — см.
// assets/journal-templates/_placeholder-example/. Пока среди 5 типов задачи
// заглушек нет, но проверка защищает от будущих типов без готового дизайна
// (докладка QR в несуществующий cover.html упала бы менее понятной ошибкой).
function isTemplateReady(type) {
  return fs.existsSync(path.join(templateSourceDir(type.folder), 'cover.html'));
}

function readSource(folder, file) {
  return fs.readFileSync(path.join(templateSourceDir(folder), file), 'utf8');
}

function countExistingInstances(folder, templateFile) {
  const prefix = templateFile.replace('_template.html', '_');
  const files = fs.readdirSync(templateSourceDir(folder));
  return files.filter((f) => f.startsWith(prefix) && /^\d+\.html$/.test(f.slice(prefix.length))).length;
}

// Достаём готовый блок пустых строк таблицы из уже приложенного примера
// (page_log_01.html и т.п.), а не собираем разметку ячеек вручную — так
// разметка строк гарантированно совпадает с дизайном (классы narrow/wide/
// xnarrow/tiny у каждого типа свои, см. любой *_template.html).
function extractRowsBlock(folder, templateFile) {
  const sampleFile = `${templateFile.replace('_template.html', '_')}01.html`;
  const templateHtml = readSource(folder, templateFile);
  const sampleHtml = readSource(folder, sampleFile);

  const [prefix, afterRows] = templateHtml.split('__ROWS__');
  const beforePagenum = afterRows.split('__PAGENUM__')[0];

  if (!sampleHtml.startsWith(prefix)) {
    throw new Error(`Шаблон ${templateFile} и образец ${sampleFile} разошлись до __ROWS__ — проверьте файлы вручную`);
  }
  const tail = sampleHtml.slice(prefix.length);
  const idx = tail.indexOf(beforePagenum);
  if (idx === -1) {
    throw new Error(`Не удалось найти конец __ROWS__ в образце ${sampleFile} для ${templateFile}`);
  }
  return tail.slice(0, idx);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function inlineBaseCss(html, folder) {
  if (!html.includes('href="base.css"')) return html;
  const css = readSource(folder, 'base.css');
  return html.replace('<link rel="stylesheet" href="base.css">', `<style>${css}</style>`);
}

function renderCover(type, { companyName, journalNumber, qrDataUrl }) {
  let html = readSource(type.folder, 'cover.html');
  html = html.replace('<div class="qr">QR</div>', `<div class="qr"><img src="${qrDataUrl}" style="width:100%;height:100%;object-fit:contain;"/></div>`);
  html = html.replace('Журнал № ______', `Журнал № ${escapeHtml(journalNumber)}`);
  html = html.replace('<div class="field-line">&nbsp;</div>', `<div class="field-line">${escapeHtml(companyName)}</div>`);
  return html;
}

function renderBackCover(type, { companyName, journalNumber }) {
  let html = readSource(type.folder, 'back_cover.html');
  html = html.replace('ИП/ООО _____________________', escapeHtml(companyName));
  html = html.replace('Журнал № ______', `Журнал № ${escapeHtml(journalNumber)}`);
  return html;
}

// Считает страницы журнала без рендера — нужно и для превью числа страниц,
// и для Этапа 4 (сколько страниц ежедневного учёта уже отпечатано).
function countPages(type) {
  let total = 0;
  for (const p of type.pages) {
    total += typeof p === 'string' ? 1 : countExistingInstances(type.folder, p.template);
  }
  return total;
}

// Собирает список готовых HTML-документов (по одному на страницу PDF), уже
// с подставленными номером/QR/названием компании и заполненными __ROWS__/
// __PAGENUM__ в повторяющихся разделах.
function buildPageDocuments(type, { companyName, journalNumber, qrDataUrl }) {
  const docs = [];
  let pageNum = 1;

  for (const entry of type.pages) {
    if (typeof entry === 'string') {
      pageNum += 1;
      if (entry === 'cover.html') {
        docs.push(renderCover(type, { companyName, journalNumber, qrDataUrl }));
      } else if (entry === 'back_cover.html') {
        docs.push(renderBackCover(type, { companyName, journalNumber }));
      } else {
        docs.push(inlineBaseCss(readSource(type.folder, entry), type.folder));
      }
      continue;
    }

    const templateHtml = readSource(type.folder, entry.template);
    const rowsBlock = extractRowsBlock(type.folder, entry.template);
    const count = countExistingInstances(type.folder, entry.template);
    for (let i = 0; i < count; i += 1) {
      pageNum += 1;
      const filled = templateHtml.replace('__ROWS__', rowsBlock).replace('__PAGENUM__', String(pageNum - 1));
      docs.push(inlineBaseCss(filled, type.folder));
    }
  }

  // cover.html не пронумерована (совпадает с исходным дизайном — у неё нет
  // .ifoot) — pageNum считался "на один вперёд" ради простоты цикла, реальный
  // номер, записанный в __PAGENUM__, всегда на 1 меньше текущего pageNum.
  return docs;
}

async function generateJournalPdf({ type, companyName, journalNumber, verifyUrl }) {
  if (!isTemplateReady(type)) {
    const err = new Error('Дизайн этого типа журнала ещё не готов');
    err.code = 'TEMPLATE_NOT_READY';
    throw err;
  }

  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 0, width: 240 });
  const pageDocs = buildPageDocuments(type, { companyName, journalNumber, qrDataUrl });
  const [widthMm, heightMm] = type.pageSizeMm;

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    const pdfBuffers = [];
    for (const html of pageDocs) {
      await page.setContent(html, { waitUntil: 'load' });
      const buf = await page.pdf({
        width: `${widthMm}mm`, height: `${heightMm}mm`,
        printBackground: true,
        margin: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      pdfBuffers.push(buf);
    }

    const merged = await PDFDocument.create();
    for (const buf of pdfBuffers) {
      const doc = await PDFDocument.load(buf);
      const copied = await merged.copyPages(doc, doc.getPageIndices());
      copied.forEach((p) => merged.addPage(p));
    }
    return Buffer.from(await merged.save());
  } finally {
    await browser.close();
  }
}

function generateJournalNumber(type, id) {
  return `${type.numberPrefix}-${String(id).padStart(6, '0')}`;
}

function generateQrToken() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = {
  JOURNAL_TYPES,
  JOURNAL_TYPE_BY_KEY,
  isTemplateReady,
  countPages,
  generateJournalPdf,
  generateJournalNumber,
  generateQrToken,
};
