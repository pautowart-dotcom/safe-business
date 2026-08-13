// Разовый генератор маркетингового "примера отчёта" для чата мастеров/рассылок.
// НЕ часть приложения и не вызывается никаким роутом — отдельный скрипт,
// запускается вручную: node backend/src/scripts/generateSampleReport.js [путь]
//
// Задача (13.08.2026, владелец): показать реальный товарный вид отчёта
// аудита безопасности, чтобы убедить оплатить подписку, но НЕ отдать всю
// диагностическую ценность бесплатно — иначе по примеру можно посчитать
// свой собственный результат и не платить.
//
// Поэтому: используются РЕАЛЬНЫЕ данные из матрицы нарушений (content/
// violations/manicure.js) — тот же контент, что в настоящем отчёте, —
// но только 2 нарушения из 8 показаны полностью (штраф/статья/решение),
// остальные 6 — заблокированы (видно только название и уровень риска).
// Вёрстка сознательно не переиспользует modules/security/report/pdf.js
// напрямую (это должен остаться нетронутым платным путём) — здесь
// небольшой самостоятельный набор тех же стилей.

const fs = require('fs');
const path = require('path');
const PdfPrinter = require('pdfmake/src/printer');
const { violations: MANICURE_VIOLATIONS } = require('../modules/security/content/violations/manicure');

const FONT_DIR = path.dirname(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'));
const FONTS = {
  DejaVuSans: {
    normal: path.join(FONT_DIR, 'DejaVuSans.ttf'),
    bold: path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'),
    italics: path.join(FONT_DIR, 'DejaVuSans-Oblique.ttf'),
    bolditalics: path.join(FONT_DIR, 'DejaVuSans-BoldOblique.ttf'),
  },
};

const ZONE_COLORS = { green: '#27ae60', yellow: '#f1c40f', red: '#c0392b' };
const ZONE_BG = { green: '#EAFAF1', yellow: '#FEF9E7', red: '#FDEDEC' };
const RISK_COLORS = [
  { min: 9, color: '#c0392b' },
  { min: 7, color: '#e67e22' },
  { min: 5, color: '#f1c40f' },
  { min: 0, color: '#27ae60' },
];
const riskColor = (risk) => RISK_COLORS.find((r) => risk >= r.min).color;
const money = (v) => (v == null ? '—' : `${v.toLocaleString('ru-RU')} ₽`);
const byCode = (code) => MANICURE_VIOLATIONS.find((v) => v.code === code);

// Полностью раскрытые — самые "цепляющие" и универсальные (публикация фото
// без согласия — есть у почти каждого мастера в соцсетях; журнал
// стерилизации — самый известный пункт проверки Роспотребнадзора).
const REVEALED_CODES = ['MN-404', 'MN-201'];
// Заблокированные — остальной реалистичный набор для самозанятого мастера
// без сотрудников (блок 4 "Персонал" не участвует — employerOnly).
const LOCKED_CODES = ['MN-202', 'MN-301', 'MN-402', 'MN-102', 'MN-604', 'MN-703'];

const revealed = REVEALED_CODES.map(byCode);
const locked = LOCKED_CODES.map(byCode);
const allViolations = [...revealed, ...locked];
const criticalCount = allViolations.filter((v) => v.risk >= 9).length;
const estimatedFineMax = allViolations.reduce((sum, v) => sum + (v.fineMax || 0), 0);

// Условная сводка по блокам — демонстрационные, но правдоподобные баллы
// (не связаны напрямую с конкретными вопросами теста, чтобы не подсказывать
// ответы; итоговый % посчитан из них же для согласованности с "жёлтой зоной").
const BLOCKS = [
  { label: 'Юридическая база', score: 3, maxScore: 4, zone: 'yellow' },
  { label: 'Санитарная безопасность', score: 4, maxScore: 7, zone: 'red' },
  { label: 'Оборудование', score: 3, maxScore: 4, zone: 'yellow' },
  { label: 'Персональные данные', score: 1, maxScore: 3, zone: 'red' },
  { label: 'Помещение', score: 3, maxScore: 4, zone: 'yellow' },
  { label: 'Дополнительные зоны', score: 2, maxScore: 3, zone: 'yellow' },
];
const totalScore = BLOCKS.reduce((s, b) => s + b.score, 0);
const totalMax = BLOCKS.reduce((s, b) => s + b.maxScore, 0);
const indexPercent = Math.round((totalScore / totalMax) * 1000) / 10;
const zone = 'yellow';
const zoneLabel = 'Жёлтая зона';

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

function styledTable(widths, headerRow, rows) {
  return {
    table: { widths, headerRows: 1, body: [headerRow.map((h) => ({ text: h, bold: true, color: '#FFFFFF', fontSize: 10 })), ...rows] },
    layout: {
      fillColor: (rowIndex) => (rowIndex === 0 ? '#2A2A2E' : rowIndex % 2 === 0 ? '#FAFAFA' : null),
      hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => '#EBEBEB',
      paddingTop: () => 6, paddingBottom: () => 6, paddingLeft: () => 8,
    },
  };
}

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
              { text: [{ text: 'Что сделать: ', color: '#888888' }, { text: v.solution }], fontSize: 10, margin: [0, 0, 0, 4] },
              { text: `${v.free ? 'Бесплатно' : money(v.costMin)} · ${v.daysMin}${v.daysMax && v.daysMax !== v.daysMin ? '–' + v.daysMax : ''} дн.`, fontSize: 9, color: '#888888' },
            ],
          }]],
        },
        layout: { fillColor: () => '#FAFAFA', paddingLeft: () => 12, paddingRight: () => 10, paddingTop: () => 10, paddingBottom: () => 10 },
      },
    ],
  };
}

// Заблокированная карточка — та же форма, что и обычная, но серая полоса
// и текст вместо штрафа/решения — видно, что пункт РЕАЛЬНО найден (не
// абстрактный "и другие"), но не видно, что именно исправлять.
function lockedViolationBlock(v, index) {
  return {
    margin: [0, 0, 0, 10],
    columns: [
      { width: 4, table: { widths: [4], heights: [1], body: [[{ text: '', border: [false, false, false, false] }]] }, layout: { fillColor: () => '#BBBBBB' } },
      {
        width: '*',
        table: {
          widths: ['*'],
          body: [[{
            border: [false, false, false, false],
            stack: [
              {
                columns: [
                  { text: `№${index + 1}  ${v.title}`, bold: true, fontSize: 11, color: '#555555' },
                  { text: [{ text: 'Риск: ', color: '#999999' }, { text: `${v.risk}/10`, color: riskColor(v.risk), bold: true }], fontSize: 10, width: 70, alignment: 'right' },
                ],
              },
              { text: '🔒 Штраф, статья закона и точное решение — в полном отчёте после теста', fontSize: 9, italics: true, color: '#999999', margin: [0, 4, 0, 0] },
            ],
          }]],
        },
        layout: { fillColor: () => '#F4F4F4', paddingLeft: () => 12, paddingRight: () => 10, paddingTop: () => 8, paddingBottom: () => 8 },
      },
    ],
  };
}

function buildDocDefinition() {
  const content = [
    { text: 'БЕЗОПАСНЫЙ БИЗНЕС', style: 'brand', margin: [0, 70, 0, 0] },
    { text: 'Пример отчёта аудита безопасности', fontSize: 15, color: '#666666', margin: [0, 6, 0, 20] },
    {
      table: { widths: ['*'], body: [[{ text: 'ПРИМЕР ДЛЯ ОЗНАКОМЛЕНИЯ · сформирован на демонстрационных данных, не относится к реальному бизнесу', bold: true, fontSize: 10, color: '#8a6d00', border: [false, false, false, false], margin: [0, 2, 0, 2] }]] },
      layout: { fillColor: () => '#FFF6D9', paddingLeft: () => 14, paddingRight: () => 14, paddingTop: () => 10, paddingBottom: () => 10 },
      margin: [0, 0, 0, 24],
    },
    {
      table: {
        widths: ['auto', '*'],
        body: [
          ['Ниша', 'Маникюр и педикюр'],
          ['Форма работы', 'Самозанятый'],
          ['Дата формирования', new Date().toLocaleDateString('ru-RU')],
          ['ID отчёта', 'DEMO-0000000'],
        ].map((row) => [{ text: row[0], color: '#888888', fontSize: 10 }, { text: row[1], fontSize: 10 }]),
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 24],
    },
    {
      table: { widths: ['*'], body: [[{ text: `Статус безопасности: ${zoneLabel}`, bold: true, fontSize: 13, color: ZONE_COLORS[zone], border: [false, false, false, false], margin: [0, 2, 0, 2] }]] },
      layout: { fillColor: () => ZONE_BG[zone], paddingLeft: () => 14, paddingRight: () => 14, paddingTop: () => 10, paddingBottom: () => 10 },
    },
    { text: '', pageBreak: 'after' },

    // --- Резюме руководителя ---
    sectionHeader(1, 'Резюме руководителя'),
    styledTable(
      ['*', '*'],
      ['Показатель', 'Значение'],
      [
        [{ text: 'Статус бизнеса', fontSize: 10 }, { text: zoneLabel, fontSize: 10, bold: true, color: ZONE_COLORS[zone] }],
        [{ text: 'Индекс безопасности', fontSize: 10 }, { text: `${indexPercent}%`, fontSize: 10, bold: true }],
        [{ text: 'Найдено нарушений', fontSize: 10 }, { text: String(allViolations.length), fontSize: 10 }],
        [{ text: 'Критических нарушений (риск 9–10)', fontSize: 10 }, { text: String(criticalCount), fontSize: 10, color: '#c0392b' }],
        [{ text: 'Ориентировочные риски', fontSize: 10 }, { text: `до ${money(estimatedFineMax)}`, fontSize: 10 }],
      ]
    ),
    { text: '', margin: [0, 14, 0, 0] },
    { text: [{ text: 'Самое опасное нарушение: ', color: '#888888' }, { text: revealed[0].title, bold: true }], fontSize: 11, margin: [0, 0, 0, 4] },
    { text: [{ text: 'Первое действие: ', color: '#888888' }, { text: `${revealed[0].solution} (срок: ${revealed[0].daysMin} дн.)`, bold: true }], fontSize: 11, margin: [0, 0, 0, 14] },

    { text: 'Общая карта безопасности', style: 'subheader', margin: [0, 10, 0, 8] },
    styledTable(
      ['*', 'auto', 'auto'],
      ['Блок', 'Баллы', 'Статус'],
      BLOCKS.map((b) => [
        { text: b.label, fontSize: 10 },
        { text: `${b.score}/${b.maxScore}`, fontSize: 10 },
        { text: b.zone === 'green' ? 'Зелёная' : b.zone === 'yellow' ? 'Жёлтая' : 'Красная', color: ZONE_COLORS[b.zone], bold: true, fontSize: 10 },
      ])
    ),
    { text: '', pageBreak: 'after' },

    // --- Карта уязвимостей ---
    sectionHeader(2, 'Карта уязвимостей'),
    { text: `Показаны 2 из ${allViolations.length} найденных нарушений полностью — остальные скрыты, чтобы пример нельзя было использовать вместо своего теста.`, fontSize: 9, italics: true, color: '#999999', margin: [0, 0, 0, 14] },
    ...revealed.map((v, i) => violationBlock(v, i)),
    { text: '', margin: [0, 6, 0, 6] },
    ...locked.map((v, i) => lockedViolationBlock(v, i + revealed.length)),
    { text: '', pageBreak: 'after' },

    // --- Что ещё в полном отчёте ---
    sectionHeader(3, 'Что есть в полном отчёте'),
    {
      ul: [
        'Точный размер штрафа и статья закона для каждого нарушения',
        'Пошаговое решение и срок устранения',
        'Дорожная карта по дням: сегодня / 7 дней / 14 дней / 30+ дней',
        'Чек-лист обязательных документов для вашей ниши',
        'Персональные рекомендации и прогноз роста индекса безопасности',
      ],
      fontSize: 11,
      margin: [0, 0, 0, 20],
    },
    {
      table: { widths: ['*'], body: [[{ text: 'Пройдите бесплатный тест на business-safe.ru — 5-7 минут, результат сразу по вашей студии.', bold: true, fontSize: 12, color: '#1a1a1a', border: [false, false, false, false], margin: [0, 4, 0, 4] }]] },
      layout: { fillColor: () => '#EAFAF1', paddingLeft: () => 14, paddingRight: () => 14, paddingTop: () => 12, paddingBottom: () => 12 },
    },

    { text: 'Дисклеймер', bold: true, fontSize: 10, color: '#999999', margin: [0, 30, 0, 6] },
    {
      text: 'Это демонстрационный пример на условных данных, не относится к какой-либо реальной студии. Реальный отчёт формируется индивидуально по ответам в бесплатном тесте и не является юридической консультацией.',
      fontSize: 8,
      color: '#999999',
    },
  ].filter(Boolean);

  return {
    content,
    defaultStyle: { font: 'DejaVuSans', fontSize: 10 },
    styles: {
      brand: { fontSize: 26, bold: true },
      sectionTitle: { fontSize: 18, bold: true },
      subheader: { fontSize: 12, bold: true },
    },
    pageMargins: [40, 40, 40, 56],
    footer: (currentPage, pageCount) => ({
      margin: [40, 12, 40, 0],
      columns: [
        { text: '«Безопасный бизнес» · Пример отчёта', fontSize: 7, color: '#AAAAAA' },
        { text: `${currentPage} / ${pageCount}`, fontSize: 7, color: '#AAAAAA', alignment: 'right' },
      ],
    }),
  };
}

function renderPdf() {
  const printer = new PdfPrinter(FONTS);
  const doc = printer.createPdfKitDocument(buildDocDefinition());
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

async function main() {
  const outPath = process.argv[2] || path.join(__dirname, '..', '..', '..', 'primer-otcheta-bezopasnosti.pdf');
  const buffer = await renderPdf();
  fs.writeFileSync(outPath, buffer);
  console.log('Готово:', outPath, `(${buffer.length} байт)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
