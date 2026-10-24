// На диске (data/state.json) — только служебное: offset Telegram, паузы
// по чатам, подключения Business, file_id карточек, «чего не хватило в
// базе» за неделю (без данных клиентов), карточки без «Взял» (тема и время),
// лист ожидания (имя и Telegram клиента + пожелания; удаляется через
// waitlistDays). Переписку с клиентами НЕ сохраняем:
// история диалога живёт в памяти и стирается через historyTtlHours.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'state.json');

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return {
      offset: s.offset || 0, paused: s.paused || {}, connections: s.connections || {},
      routeFileIds: s.routeFileIds || null, gaps: s.gaps || [], gapsReportedAt: s.gapsReportedAt || Date.now(),
      openCards: s.openCards || {}, nightChats: s.nightChats || 0, digestDate: s.digestDate || null,
      waitlist: s.waitlist || [],
    };
  } catch {
    return {
      offset: 0, paused: {}, connections: {}, routeFileIds: null, gaps: [], gapsReportedAt: Date.now(),
      openCards: {}, nightChats: 0, digestDate: null, waitlist: [],
    };
  }
}

function save(state) {
  const now = Date.now();
  for (const [chat, until] of Object.entries(state.paused)) if (until < now) delete state.paused[chat];
  for (const [id, c] of Object.entries(state.openCards)) if (now - c.at > 3 * 24 * 3600 * 1000) delete state.openCards[id];
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
}

// История в памяти: chatId → { at, items: [{role, text}] }
function createHistory({ limit, ttlHours }) {
  const map = new Map();
  const ttl = ttlHours * 3600 * 1000;
  return {
    get(chatId) {
      const h = map.get(chatId);
      if (!h || Date.now() - h.at > ttl) { map.delete(chatId); return []; }
      return h.items;
    },
    push(chatId, role, text) {
      const items = [...this.get(chatId), { role, text }].slice(-limit);
      map.set(chatId, { at: Date.now(), items });
    },
  };
}

module.exports = { load, save, createHistory };
