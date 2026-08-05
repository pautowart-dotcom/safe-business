// new Date().toISOString().slice(0, 10) — тот же класс бага, что чинили на
// бэкенде (utils/moscowDate.js), только тут наоборот: toISOString ВСЕГДА
// возвращает UTC-дату, а телефон/браузер живёт в своём локальном часовом
// поясе (Москва+). Для "сегодня" это расхождение только в узком окне
// местной полуночи — для дат, СКОНСТРУИРОВАННЫХ через new Date(y, m, d)
// (местная полночь), toISOString уводит календарный день на сутки назад
// целиком, при любом времени суток (Finance.jsx: начало месяца/недели).
export function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
