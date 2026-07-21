// "Сформировать досье" (Пакет 3, Этап 8) — тот же механизм pdfmake + DejaVu
// Sans, что и отчёт безопасности/журналы. Досье собирает разнородную
// историю (визиты, чек-листы, журналы) в один документ по клиенту/дате/
// мастеру, поэтому строит секции сам, а не переиспользует табличный
// renderJournalPdf (тот рассчитан на один плоский список).
const fs = require('fs');
const path = require('path');
const PdfPrinter = require('pdfmake/src/printer');
const { UPLOADS_DIR, filenameFromUrl } = require('../core/fileStorage');

const FONT_DIR = path.dirname(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'));
const FONTS = {
  DejaVuSans: {
    normal: path.join(FONT_DIR, 'DejaVuSans.ttf'),
    bold: path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'),
    italics: path.join(FONT_DIR, 'DejaVuSans-Oblique.ttf'),
    bolditalics: path.join(FONT_DIR, 'DejaVuSans-BoldOblique.ttf'),
  },
};

// Фото визитов хранятся локально на диске (core/fileStorage.js) — читаем
// напрямую и встраиваем как base64, а не по URL (pdfmake не умеет тянуть
// сетевые изображения без доп. настройки, да и они всё равно на этом же
// сервере). Отсутствующий/битый файл — просто пропускаем фото, не роняем
// формирование всего документа.
function imageDataUri(url) {
  const filename = filenameFromUrl(url);
  if (!filename) return null;
  try {
    const buffer = fs.readFileSync(path.join(UPLOADS_DIR, filename));
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function sectionHeader(text) {
  return { text, style: 'sectionHeader', margin: [0, 16, 0, 8] };
}

function visitBlock(v) {
  const photos = [v.photo_before_url, v.photo_after_url].map(imageDataUri).filter(Boolean);
  return {
    margin: [0, 0, 0, 12],
    stack: [
      { text: `${new Date(v.visit_at).toLocaleString('ru-RU')} — ${v.service}`, bold: true },
      { text: `Клиент: ${v.client_last_name} ${v.client_first_name}` },
      { text: `Мастер: ${v.master_name || 'Сотрудник'}` },
      { text: `Сумма: ${Number(v.final_amount ?? v.amount).toLocaleString('ru-RU')} ₽${v.discount_percent > 0 ? ` (скидка ${v.discount_percent}%)` : ''}` },
      v.materials ? { text: `Материалы: ${v.materials}` } : null,
      photos.length > 0
        ? { columns: photos.map((img) => ({ image: img, width: 150, margin: [0, 4, 8, 0] })) }
        : null,
    ].filter(Boolean),
  };
}

function checklistBlock(rows) {
  if (rows.length === 0) return { text: 'Отметок чек-листов не найдено.' };
  return {
    table: {
      widths: ['auto', '*', 'auto', 'auto'],
      body: [
        [{ text: 'Дата', bold: true }, { text: 'Пункт', bold: true }, { text: 'Кто', bold: true }, { text: 'Отмечено', bold: true }],
        ...rows.map((r) => [
          new Date(r.mark_date).toLocaleDateString('ru-RU'),
          `${r.template_name}${r.kind ? ' · ' + (r.kind === 'opening' ? 'Открытие' : 'Закрытие') : ''} — ${r.label}`,
          r.membership_name || 'Сотрудник',
          r.checked ? new Date(r.checked_at).toLocaleString('ru-RU') : 'Не отмечено',
        ]),
      ],
    },
  };
}

function journalsBlock({ uvLamp, briefing }) {
  const blocks = [];
  if (uvLamp.length > 0) {
    blocks.push({ text: 'Журнал УФ-лампы', style: 'subheader', margin: [0, 6, 0, 4] });
    blocks.push({
      ul: uvLamp.map((r) => `${r.action === 'on' ? 'Включил' : 'Выключил'} — ${r.membership_name || 'Сотрудник'}, ${new Date(r.occurred_at).toLocaleString('ru-RU')}`),
    });
  }
  if (briefing.length > 0) {
    blocks.push({ text: 'Журнал инструктажа', style: 'subheader', margin: [0, 10, 0, 4] });
    blocks.push({
      ul: briefing.map(
        (r) =>
          `${r.topic || 'Инструктаж на рабочем месте'} — провёл: ${r.conductor_name || 'Сотрудник'}, получил: ${r.recipient_name || 'Сотрудник'} (${new Date(r.created_at).toLocaleDateString('ru-RU')})`
      ),
    });
  }
  if (blocks.length === 0) return [{ text: 'Записей журналов не найдено.' }];
  return blocks;
}

function buildDocDefinition({ title, companyName, subtitle, visits, checklistMarks, journals }) {
  const content = [
    { text: title, style: 'brand' },
    { text: companyName, fontSize: 12, color: '#6B6B6B', margin: [0, 2, 0, 0] },
    subtitle ? { text: subtitle, fontSize: 11, color: '#6B6B6B', margin: [0, 2, 0, 0] } : null,
    { text: `Сформировано: ${new Date().toLocaleString('ru-RU')}`, fontSize: 9, color: '#6B6B6B', margin: [0, 2, 0, 16] },

    sectionHeader(`Визиты (${visits.length})`),
    visits.length === 0 ? { text: 'Визитов не найдено.' } : { stack: visits.map(visitBlock) },
  ].filter(Boolean);

  if (checklistMarks) {
    content.push(sectionHeader('Чек-листы'));
    content.push(checklistBlock(checklistMarks));
  }
  if (journals) {
    content.push(sectionHeader('Журналы'));
    content.push(...journalsBlock(journals));
  }

  content.push({
    text: 'Документ сформирован автоматически из данных, внесённых в сервис «Безопасный бизнес», и носит справочный характер.',
    fontSize: 9,
    italics: true,
    margin: [0, 16, 0, 0],
  });

  return {
    content,
    defaultStyle: { font: 'DejaVuSans', fontSize: 10 },
    styles: {
      brand: { fontSize: 20, bold: true },
      sectionHeader: { fontSize: 14, bold: true },
      subheader: { fontSize: 11, bold: true },
    },
    pageMargins: [40, 40, 40, 40],
  };
}

function renderDossierPdf(data) {
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

module.exports = { renderDossierPdf };
