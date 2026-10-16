// PDF ежемесячного отчёта франчайзеру (16.10.2026, этап 4 франшизы: Ф28).
// pdfmake + DejaVu Sans — тот же выбор, что roadmapPdf.js и
// modules/security/report/pdf.js (кириллица). Данные — buildMonthlyReport()
// из modules/franchise/report.js, здесь только вёрстка.
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
const MUTED = '#6b7280';

function fmtDate(d) {
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function delta(now, before, suffix = '') {
  if (now == null || before == null) return '';
  const d = now - before;
  if (d === 0) return ' (без изменений)';
  return ` (${d > 0 ? '+' : ''}${d}${suffix} за месяц)`;
}

function section(title) {
  return { text: title, bold: true, fontSize: 13, color: ACCENT, margin: [0, 16, 0, 6] };
}

function list(items) {
  return items.length > 0 ? { ul: items, margin: [0, 0, 0, 4] } : { text: 'Нет', color: MUTED };
}

function buildDocDefinition(report) {
  const n = report.network;
  const b = report.before;
  const statRow = (label, value) => [{ text: label, color: MUTED }, { text: value, bold: true }];

  return {
    defaultStyle: { font: 'DejaVuSans', fontSize: 10.5, lineHeight: 1.25 },
    pageMargins: [40, 40, 40, 50],
    footer: (page, pages) => ({ text: `Безопасный бизнес · отчёт по сети · ${page} из ${pages}`, alignment: 'center', fontSize: 8, color: MUTED, margin: [0, 20, 0, 0] }),
    content: [
      { text: `Отчёт по сети «${n.name}»`, fontSize: 18, bold: true },
      { text: `за ${report.label}${report.isCurrent ? ' (месяц ещё идёт)' : ''}`, color: MUTED, margin: [0, 2, 0, 0] },
      report.afterIsLive && !report.isCurrent
        ? { text: 'Снимка на конец месяца нет — цифры показаны на сегодня.', color: MUTED, fontSize: 9, margin: [0, 4, 0, 0] }
        : '',

      section('Сеть в цифрах'),
      {
        table: {
          widths: ['*', 'auto'],
          body: [
            statRow('Точек в сети', `${n.pointsTotal}${delta(n.pointsTotal, b?.pointsTotal)}`),
            statRow('Средний индекс', n.averageIndexPercent != null ? `${n.averageIndexPercent}%${delta(n.averageIndexPercent, b?.averageIndexPercent, ' п.')}` : '—'),
            statRow('Зелёная / жёлтая / красная зона', `${n.zoneCounts.green} / ${n.zoneCounts.yellow} / ${n.zoneCounts.red}`),
            statRow('Требуют внимания', `${n.pointsAtRisk}${delta(n.pointsAtRisk, b?.pointsAtRisk)}`),
            statRow('Неисправленных нарушений', `${n.violationsOpen ?? '—'}${delta(n.violationsOpen, b?.violationsOpen)}`),
            statRow('Готовятся к открытию', String(n.pointsPreparing)),
            statRow('Ещё не проходили тест', String(n.pointsUntested)),
          ],
        },
        layout: 'lightHorizontalLines',
      },
      !b ? { text: 'Сравнение с прошлым месяцем появится, когда накопится снимок на начало месяца.', color: MUTED, fontSize: 9, margin: [0, 6, 0, 0] } : '',

      section('Требуют внимания сейчас'),
      list(report.atRisk.map((p) => `${p.companyName}: ${p.reasons.join(', ')}`)),

      ...(b
        ? [
            section('Стало лучше'),
            list(report.improved.map((c) => `${c.companyName}: ${c.from}% → ${c.to}%`)),
            section('Стало хуже'),
            list(report.worsened.map((c) => `${c.companyName}: ${c.from}% → ${c.to}%`)),
          ]
        : []),

      section('Открытия'),
      list([
        ...report.opened.map((o) => `Открылась: ${o.companyName} (${fmtDate(o.date)})`),
        ...report.joined.map((o) => `Вступила в сеть: ${o.companyName} (${fmtDate(o.date)})`),
        ...report.preparing.map((p) => `Готовится: ${p.companyName} — ${p.done} из ${p.total}${p.currentStage ? `, сейчас: ${p.currentStage}` : ''}`),
      ]),

      section('Задачи сети за месяц'),
      list(report.tasks.map((t) => `${t.title} — сделали ${t.done} из ${t.total}`)),

      {
        text: 'Сводка строится по данным, которые точки внесли сами, и по их тесту безопасности. Это не юридическое заключение и не результат проверки.',
        color: MUTED,
        fontSize: 8.5,
        margin: [0, 24, 0, 0],
      },
    ],
  };
}

function renderNetworkReportPdf(report) {
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

module.exports = { renderNetworkReportPdf };
