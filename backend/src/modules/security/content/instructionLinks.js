// Подробные инструкции «как сделать» (25.10.2026, план пакета этап 6,
// docs/paket-vse-nishi-2026-10-24.md). Тексты — content/instructions/*.md
// (до 25.10 лежали в docs/instrukcii-zhurnaly/, перенесены, чтобы уезжать на
// сервер вместе с backend/). Каждая сверена с текстом закона на garant.ru —
// дата и пункты в абзаце под заголовком.
//
// Связка с тестом — по точному названию пункта в матрице нарушений ниши, как
// COMMON_LINKS в document-templates/content/templateViolationLinks.js: коды у
// ниш разные (MN-602, FD-604, UNI-303…), названия общие. Одна инструкция
// закрывает пункт в десятках ниш; у пункта может быть и две (инструкция о
// мерах пожарной безопасности → помещение + противопожарный инструктаж).
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'instructions');

const is = (...titles) => (t) => titles.includes(t);

const INSTRUCTIONS = [
  { key: 'sterilizaciya', file: '01-sterilizaciya.md', match: is('Журнал стерилизации', 'Контроль качества стерилизации', 'Стерилизация инструмента для чистки лица', 'Стерилизация многоразового инструмента (автоклав/сухожар)') },
  { key: 'ognetushiteli', file: '02-ognetushiteli.md', match: is('Учёт огнетушителей в журнале эксплуатации систем противопожарной защиты', 'Акты проверки огнетушителей', 'Огнетушители: журнал учёта и акты проверки') },
  { key: 'uborka', file: '03-uborka.md', match: is('Журнал уборки', 'График генеральных уборок') },
  { key: 'recirkulyator', file: '04-recirkulyator.md', match: is('Журнал рециркулятора', 'Отсутствует рециркулятор') },
  // ХАССП общепита сюда не относится — у него свои правила (N8, позже)
  { key: 'proizvodstvennyj-kontrol', file: '05-proizvodstvennyj-kontrol.md', match: is('Программа производственного контроля (ППК)') },
  { key: 'instruktazh-ohrana-truda', file: '06-instruktazh-ohrana-truda.md', match: is('Инструктаж по охране труда') },
  { key: 'pozharnaya-bezopasnost-pomeshcheniya', file: '08-pozharnaya-bezopasnost-pomeshcheniya.md', match: is('Инструкция о мерах пожарной безопасности', 'План эвакуации', 'Пожарная сигнализация', 'Нет документов о классе пожарной опасности отделки') },
  { key: 'instruktazh-pozharnyj', file: '07-instruktazh-pozharnyj.md', match: is('Инструкция о мерах пожарной безопасности') },
  {
    key: 'dokumenty-na-oborudovanie',
    file: '09-dokumenty-na-oborudovanie-i-materialy.md',
    match: (t) => ['Инструкции на оборудование', 'Инструкции на оборудование и снаряжение', 'Ввод оборудования в эксплуатацию', 'Документы на косметологическое оборудование'].includes(t)
      || /^Сертификат(ы)?( ЕАС)?( и декларации)? на /.test(t) || /^Сертификаты\/декларации на /.test(t),
  },
  { key: 'dogovory-musor-dezinsekciya', file: '10-dogovory-musor-dezinsekciya-othody.md', match: is('Вывоз ТКО', 'Дезинсекция и дератизация', 'Утилизация отходов и вывоз ТБО', 'Отходы класса Б') },
  { key: 'sout', file: '11-sout.md', match: is('СОУТ', 'Специальная оценка условий труда (СОУТ)') },
  { key: 'uvedomlenie-o-nachale', file: '12-uvedomlenie-o-nachale-deyatelnosti.md', match: (t) => t.startsWith('Уведомление о начале деятельности') || t === 'ОКВЭД и уведомление о начале деятельности' },
  { key: 'roskomnadzor', file: '13-uvedomlenie-roskomnadzor.md', match: is('Роскомнадзор', 'Уведомление Роскомнадзора') },
  // медосмотры по вредным факторам (вибрация, шум, пыль, высота) — другие
  // пункты приказа 29н, инструкция их не разбирает
  { key: 'medknizhki', file: '14-medknizhki.md', match: is('Медицинские книжки', 'Периодические медицинские осмотры персонала') },
  { key: 'efs-1', file: '15-kadrovaya-otchetnost-sfr.md', match: (t) => t.startsWith('Отчётность в СФР о кадровых событиях') },
  { key: 'vyveska', file: '16-vyveska.md', match: is('Вывеска без согласования') },
  { key: 'muzyka', file: '17-muzyka.md', match: is('Музыкальное сопровождение') },
];

const textCache = {};

function readText(file) {
  if (!(file in textCache)) textCache[file] = fs.readFileSync(path.join(DIR, file), 'utf8');
  return textCache[file];
}

function titleOf(file) {
  const first = readText(file).split('\n').find((l) => l.startsWith('# '));
  return first ? first.slice(2).trim() : file;
}

// Инструкции к пункту теста: [{ key, title }] — для карточки нарушения.
function forViolationTitle(violationTitle) {
  return INSTRUCTIONS.filter((i) => i.match(violationTitle)).map((i) => ({ key: i.key, title: titleOf(i.file) }));
}

// Полный текст инструкции (markdown) или null.
function getInstruction(key) {
  const i = INSTRUCTIONS.find((x) => x.key === key);
  if (!i) return null;
  return { key: i.key, title: titleOf(i.file), markdown: readText(i.file) };
}

module.exports = { INSTRUCTIONS, forViolationTitle, getInstruction };
