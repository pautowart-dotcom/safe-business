// Рабочие часы студии в её часовом поясе — от этого зависит, что бот
// обещает («администратор подключится в ближайшее время» или «утром») и пометка на карточке.

function localParts(now, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('ru-RU', {
      timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      day: 'numeric', month: 'long', weekday: 'long',
    }).formatToParts(now).map((p) => [p.type, p.value])
  );
  return { hhmm: `${parts.hour}:${parts.minute}`, label: `${parts.weekday}, ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute}` };
}

function inWorkHours(config, now = new Date()) {
  const { hhmm } = localParts(now, config.timezone);
  const { from, to } = config.workHours;
  return hhmm >= from && hhmm < to;
}

// Что обещать клиенту, когда передаём человеку.
function replyPromise(config, now = new Date()) {
  return inWorkHours(config, now) ? config.replyPromise : `утром, после ${config.workHours.from}`;
}

// Дата в поясе студии, '2026-10-24' — чтобы утренняя сводка уходила раз в день.
function localDateKey(now, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

module.exports = { localParts, inWorkHours, replyPromise, localDateKey };
