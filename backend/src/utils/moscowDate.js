// Все студии — в России, преимущественно московского часового пояса (см.
// также deploy/nginx.conf, ЮKassa у владельца тоже стоит на "Москва,
// Санкт-Петербург, Нижний Новгород"). Сервер сам при этом почти наверняка
// работает в UTC (нигде в проекте не выставлен TZ при провижининге) — прямой
// new Date().getHours()/toISOString() даёт МОСКОВСКИЙ "сегодня" только
// случайно, а в окне UTC 21:00–23:59 (00:00–02:59 по Москве) — календарную
// дату на день раньше настоящей. Отсюда и баг "нет выручки за сегодня".
const MOSCOW_TZ = 'Europe/Moscow';

// en-CA форматирует как YYYY-MM-DD — единственная причина этой locale, не
// формальность.
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: MOSCOW_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: MOSCOW_TZ, hour: 'numeric', hourCycle: 'h23' });

function moscowDateStr(date = new Date()) {
  return dateFormatter.format(date);
}

function moscowHour(date = new Date()) {
  return Number(hourFormatter.format(date));
}

module.exports = { moscowDateStr, moscowHour };
