// ИИ-помощник админа студий. Клиенты пишут в Telegram-аккаунт студии,
// бот подключён к нему через Telegram Business и отвечает от его имени.
// Сложное — карточкой в группу «Админ» с кнопкой «Взял».
// Админ написал в чат сам или нажал «Взял» → бот в этом чате молчит
// pauseHoursAfterAdmin часов. Запуск: node src/bot.js (long polling).
const path = require('path');
const { loadEnv } = require('./env');
loadEnv();

const tg = require('./tg');
const { esc } = tg;
const { loadConfig, loadKb, loadStyle } = require('./kb');
const { inWorkHours, localDateKey } = require('./hours');
const brain = require('./brain');
const yandex = require('./yandex');
const store = require('./state');

const config = loadConfig();
const kb = loadKb();
const styleText = loadStyle();
const state = store.load();
const history = store.createHistory({ limit: config.historyLimit, ttlHours: config.historyTtlHours });
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || null;

const pending = new Map(); // chatId → { items, timer, bcId, from }

function isPaused(chatId) {
  return (state.paused[chatId] || 0) > Date.now();
}

function pause(chatId) {
  state.paused[chatId] = Date.now() + config.pauseHoursAfterAdmin * 3600 * 1000;
  store.save(state);
}

async function connection(bcId) {
  if (!state.connections[bcId]) {
    const r = await tg.call('getBusinessConnection', { business_connection_id: bcId });
    if (!r.ok) return null;
    rememberConnection(r.result);
  }
  return state.connections[bcId];
}

function rememberConnection(c) {
  state.connections[c.id] = {
    ownerId: c.user.id,
    enabled: c.is_enabled !== false,
    canReply: c.rights ? !!c.rights.can_reply : c.can_reply !== false,
  };
  store.save(state);
  console.log(`[business] ${c.id}: ${c.is_enabled === false ? 'отключён' : 'подключён'} (аккаунт ${c.user.id})`);
}

function mediaKind(m) {
  if (m.voice || m.video_note) return 'голосовое';
  if (m.photo) return 'фото';
  if (m.video) return 'видео';
  if (m.document) return 'файл';
  if (m.audio) return 'аудио';
  return null;
}

// Клиенты часто пишут несколькими сообщениями подряд — ждём паузу и отвечаем одним.
function enqueue(m, bcId) {
  const chatId = String(m.chat.id);
  const p = pending.get(chatId) || { items: [], bcId, from: m.from };
  p.items.push(m);
  clearTimeout(p.timer);
  p.timer = setTimeout(() => {
    pending.delete(chatId);
    // Ответы в одном чате — строго по очереди: иначе второй ответ готовится,
    // пока первый ещё у ИИ, не видит его в истории и, например, здоровается заново.
    const prev = chains.get(chatId) || Promise.resolve();
    const next = prev.then(() => handle(chatId, p)).catch((err) => console.error('[handle]', chatId, err));
    chains.set(chatId, next);
    next.then(() => { if (chains.get(chatId) === next) chains.delete(chatId); });
  }, config.debounceMs);
  pending.set(chatId, p);
}

const chains = new Map(); // chatId → промис последнего ответа

async function handle(chatId, { items, bcId, from }) {
  if (isPaused(chatId)) return;
  const texts = items.map((m) => m.text || m.caption).filter(Boolean);
  const media = items.map(mediaKind).find(Boolean);
  if (!texts.length && !media) return; // стикеры, реакции и т. п. — молчим
  const text = texts.join('\n');

  const clientName = brain.nameForGreeting([from?.first_name, from?.last_name].filter(Boolean).join(' '));
  const result = media
    ? brain.mediaAnswer({ caption: text, kind: media, config })
    : await brain.answer({ text, history: history.get(chatId), config, kbText: kb.text, styleText, clientName, llm: (msgs) => yandex.complete(msgs) });

  // Пока думали, админ мог ответить сам — тогда не встреваем.
  if (isPaused(chatId)) return;

  const payload = { chat_id: chatId, text: result.reply };
  if (bcId) payload.business_connection_id = bcId;
  await tg.call('sendMessage', payload);
  if (result.attach === 'route') await sendRouteCards(chatId, bcId);
  if (result.gap) state.gaps.push(result.gap);
  if (result.waitlist) addToWaitlist(chatId, from, result.waitlist);
  if (!inWorkHours(config) && !nightSeen.has(chatId)) {
    nightSeen.add(chatId);
    state.nightChats += 1;
  }
  store.save(state);

  history.push(chatId, 'user', text || `[${media}]`);
  history.push(chatId, 'assistant', result.reply);
  console.log(`[${chatId}] ${result.topic} → ${result.handoff}${result.guard ? ` (${result.guard})` : ''}`);

  if (result.handoff !== 'none') {
    await sendCard({ chatId, from, text: text || `[${media}]`, result });
    // Днём админ подхватит сам — дальнейшие «ну что там?» не гоняем через ИИ.
    // Ночью не молчим: админа до утра нет, бот ещё пригодится.
    if (config.pauseAfterCard && inWorkHours(config)) {
      pause(chatId);
      console.log(`[${chatId}] карточка администратору — бот молчит ${config.pauseHoursAfterAdmin} ч`);
    }
  }
}

// Карточки «Как войти в студию» — альбомом. Первый раз загружаем файлы,
// дальше шлём по file_id. Одному клиенту — не чаще раза в сутки.
const routeSentAt = new Map();

async function sendRouteCards(chatId, bcId) {
  if (!config.routeCards?.length) return;
  if (Date.now() - (routeSentAt.get(chatId) || 0) < 24 * 3600 * 1000) return;
  routeSentAt.set(chatId, Date.now());
  const base = { chat_id: chatId, business_connection_id: bcId || undefined };
  if (state.routeFileIds) {
    const r = await tg.call('sendMediaGroup', { ...base, media: state.routeFileIds.map((id) => ({ type: 'photo', media: id })) });
    if (r.ok) return;
    state.routeFileIds = null; // file_id протух — загрузим заново
  }
  const files = Object.fromEntries(config.routeCards.map((f, i) => [`f${i}`, path.join(__dirname, '..', f)]));
  const r = await tg.upload('sendMediaGroup', { ...base, media: Object.keys(files).map((k) => ({ type: 'photo', media: `attach://${k}` })) }, files);
  if (r.ok) {
    state.routeFileIds = r.result.map((m) => m.photo.at(-1).file_id);
    store.save(state);
  }
}

// «Чего не хватило в базе» — раз в gapsReportEveryDays в группу «Админ»
// (или сразу по /probely). Одинаковые вопросы склеиваем со счётчиком.
async function reportGaps({ force = false } = {}) {
  if (!ADMIN_CHAT_ID) return;
  const due = Date.now() - state.gapsReportedAt >= config.gapsReportEveryDays * 24 * 3600 * 1000;
  if (!force && (!due || !inWorkHours(config))) return;
  const counts = new Map();
  for (const g of state.gaps) {
    const key = g.toLowerCase().replace(/[.!?\s]+$/, '');
    counts.set(key, { text: g, n: (counts.get(key)?.n || 0) + 1 });
  }
  const list = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 30);
  const text = list.length
    ? ['<b>Чего не хватило в базе бота</b>', 'На эти вопросы бот не нашёл ответа и позвал администратора. Допишите ответы в baza.md — в следующий раз ответит сам.', '', ...list.map((g) => `• ${esc(g.text)}${g.n > 1 ? ` (спрашивали: ${g.n})` : ''}`)].join('\n')
    : 'За это время бот нашёл в базе ответы на все вопросы.';
  const r = await tg.call('sendMessage', { chat_id: ADMIN_CHAT_ID, text, parse_mode: 'HTML' });
  if (r.ok) {
    state.gaps = [];
    state.gapsReportedAt = Date.now();
    store.save(state);
  }
}

const TITLES = { urgent: 'СРОЧНО', normal: 'Администратору', lead: 'Руководителю' };

async function sendCard({ chatId, from, text, result }) {
  if (!ADMIN_CHAT_ID) {
    console.warn('[card] ADMIN_CHAT_ID не задан — карточка не отправлена');
    return;
  }
  const name = [from?.first_name, from?.last_name].filter(Boolean).join(' ') || 'Клиент';
  const lines = (mention) => [
    `<b>${TITLES[result.handoff]} · ${esc(result.topic)}</b>`,
    `Клиент: ${mention ? `<a href="tg://user?id=${from.id}">${esc(name)}</a>` : esc(name)}${from?.username ? ` @${esc(from.username)}` : ''}`,
    result.summary ? `Суть: ${esc(result.summary)}` : null,
    `Написал(а): «${esc(text.slice(0, 500))}»`,
    `Бот ответил: «${esc(result.reply)}»`,
    inWorkHours(config) ? null : '<i>Пришло в нерабочее время — ответить утром.</i>',
  ].filter(Boolean).join('\n');
  const markup = { inline_keyboard: [[{ text: 'Взял', callback_data: `take:${chatId}` }]] };

  let r = await tg.call('sendMessage', { chat_id: ADMIN_CHAT_ID, text: lines(true), parse_mode: 'HTML', reply_markup: markup });
  // Ссылка на профиль может не пройти из-за настроек приватности клиента — тогда без неё.
  if (!r.ok) r = await tg.call('sendMessage', { chat_id: ADMIN_CHAT_ID, text: lines(false), parse_mode: 'HTML', reply_markup: markup });
  // Для утренней сводки «ждут ответа» — только тема и время, без данных клиента.
  if (r.ok) {
    state.openCards[r.result.message_id] = { at: Date.now(), title: `${TITLES[result.handoff]} · ${result.topic}` };
    store.save(state);
  }
}

// Ссылка на сообщение в группе «Админ» (работает в супергруппах: id вида -100…).
function cardLink(messageId) {
  const id = String(ADMIN_CHAT_ID);
  return id.startsWith('-100') ? `https://t.me/c/${id.slice(4)}/${messageId}` : null;
}

// ---- Лист ожидания: бот собирает пожелания, окно предлагает администратор. ----
const nightSeen = new Set();

function addToWaitlist(chatId, from, entry) {
  state.waitlist = state.waitlist.filter((w) => w.chatId !== chatId); // одна заявка на клиента — последняя
  state.waitlist.push({
    id: Date.now().toString(36), at: Date.now(), chatId,
    name: [from?.first_name, from?.last_name].filter(Boolean).join(' ') || 'Клиент',
    username: from?.username || '', fromId: from?.id, ...entry,
  });
}

function cleanWaitlist() {
  const before = state.waitlist.length;
  state.waitlist = state.waitlist.filter((w) => Date.now() - w.at < config.waitlistDays * 24 * 3600 * 1000);
  if (state.waitlist.length !== before) store.save(state);
}

async function showWaitlist() {
  cleanWaitlist();
  if (!state.waitlist.length) return tg.call('sendMessage', { chat_id: ADMIN_CHAT_ID, text: 'Лист ожидания пуст.' });
  const fmt = (d) => new Date(d).toLocaleDateString('ru-RU', { timeZone: config.timezone, day: 'numeric', month: 'short' });
  const lines = state.waitlist.map((w, i) => [
    `<b>${i + 1}. ${esc(w.name)}</b>${w.username ? ` @${esc(w.username)}` : ''} — с ${fmt(w.at)}`,
    [w.studio, w.service, w.master ? `к ${w.master}` : ''].filter(Boolean).map(esc).join(', '),
    `Удобно: ${esc(w.when)}`,
  ].filter(Boolean).join('\n'));
  const text = `<b>Лист ожидания</b>\nХранится ${config.waitlistDays} дней. Предложили окно — нажмите номер, клиент уйдёт из списка.\n\n${lines.join('\n\n')}`;
  const buttons = state.waitlist.map((w, i) => ({ text: `${i + 1} — предложили`, callback_data: `wl:${w.id}` }));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 3) rows.push(buttons.slice(i, i + 3));
  return tg.call('sendMessage', { chat_id: ADMIN_CHAT_ID, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
}

// ---- Утренняя сводка: в начале рабочего дня, раз в день. ----
async function morningDigest() {
  if (!ADMIN_CHAT_ID || !inWorkHours(config)) return;
  const today = localDateKey(new Date(), config.timezone);
  if (state.digestDate === today) return;
  state.digestDate = today;
  cleanWaitlist();
  const open = Object.entries(state.openCards);
  const lines = [];
  if (state.nightChats) lines.push(`Ночью написали клиентов: ${state.nightChats}. Бот ответил всем.`);
  if (open.length) {
    lines.push(`Ждут администратора: ${open.length}`);
    for (const [id, c] of open) {
      const link = cardLink(id);
      lines.push(`• ${link ? `<a href="${link}">${esc(c.title)}</a>` : esc(c.title)}`);
    }
  }
  if (state.waitlist.length) lines.push(`В листе ожидания: ${state.waitlist.length} — /ozhidanie`);
  state.nightChats = 0;
  nightSeen.clear();
  store.save(state);
  if (!lines.length) return; // тихая ночь — не шумим
  await tg.call('sendMessage', { chat_id: ADMIN_CHAT_ID, text: ['<b>Доброе утро! Что было ночью</b>', ...lines].join('\n'), parse_mode: 'HTML', disable_web_page_preview: true });
}

async function onCallback(q) {
  if (String(q.message?.chat?.id) !== String(ADMIN_CHAT_ID)) {
    return tg.call('answerCallbackQuery', { callback_query_id: q.id });
  }
  const wl = q.data?.match(/^wl:(\w+)$/);
  if (wl) {
    state.waitlist = state.waitlist.filter((w) => w.id !== wl[1]);
    store.save(state);
    await tg.call('answerCallbackQuery', { callback_query_id: q.id, text: 'Убрали из листа ожидания' });
    return showWaitlist();
  }
  const m = q.data?.match(/^take:(-?\d+)$/);
  if (!m) return tg.call('answerCallbackQuery', { callback_query_id: q.id });
  delete state.openCards[q.message.message_id];
  pause(m[1]);
  const who = [q.from.first_name, q.from.last_name].filter(Boolean).join(' ');
  await tg.call('answerCallbackQuery', { callback_query_id: q.id, text: `Бот молчит в этом чате ${config.pauseHoursAfterAdmin} ч` });
  await tg.call('editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });
  await tg.call('sendMessage', { chat_id: q.message.chat.id, text: `В работе у: ${who}`, reply_parameters: { message_id: q.message.message_id } });
}

async function onBusinessMessage(m) {
  const conn = await connection(m.business_connection_id);
  if (!conn || !conn.enabled || !conn.canReply) return;
  if (m.from?.id === conn.ownerId) {
    // Ответ, отправленный самим ботом, тоже приходит сюда — его не считаем.
    if (m.sender_business_bot) return;
    const text = m.text || m.caption;
    // Подтверждение/напоминание Dikidi с номера студии — не человек, паузу не ставим,
    // но запоминаем: клиент может ответить «не смогу прийти».
    if (brain.isAutoMessage(text, config.autoMessagePatterns)) {
      history.push(String(m.chat.id), 'assistant', `[автосообщение Dikidi] ${text}`);
      console.log(`[${m.chat.id}] автосообщение Dikidi — бот не молчит`);
      return;
    }
    pause(String(m.chat.id));
    // Начало текста — чтобы по журналу понять, не приняли ли шаблон Dikidi за человека.
    console.log(`[${m.chat.id}] ответил человек — бот молчит ${config.pauseHoursAfterAdmin} ч («${String(text || '[не текст]').slice(0, 40)}»)`);
    return;
  }
  if (isPaused(String(m.chat.id))) return;
  enqueue(m, m.business_connection_id);
}

async function onMessage(m) {
  if (m.text?.startsWith('/chatid')) {
    console.log(`[chatid] ${m.chat.title || m.chat.type}: ${m.chat.id}`);
    return tg.call('sendMessage', { chat_id: m.chat.id, text: `id этого чата: ${m.chat.id}\nВпишите его в .env как ADMIN_CHAT_ID и перезапустите бота.` });
  }
  if (String(m.chat.id) === String(ADMIN_CHAT_ID)) {
    if (m.text?.startsWith('/probely')) await reportGaps({ force: true });
    if (m.text?.startsWith('/ozhidanie')) await showWaitlist();
    return;
  }
  if (m.chat.type === 'private' && config.answerDirectMessages) {
    if (m.text === '/start') {
      const hello = `${brain.greeting(config)}\n\nПодскажу по услугам, ценам и записи — что вас интересует?`;
      history.push(String(m.chat.id), 'assistant', hello); // чтобы следующий ответ не здоровался второй раз
      return tg.call('sendMessage', { chat_id: m.chat.id, text: hello });
    }
    enqueue(m, null);
  }
}

async function onUpdate(u) {
  if (u.business_connection) return rememberConnection(u.business_connection);
  if (u.business_message) return onBusinessMessage(u.business_message);
  if (u.callback_query) return onCallback(u.callback_query);
  if (u.message) return onMessage(u.message);
}

async function main() {
  if (!process.env.STUDIO_BOT_TOKEN) {
    console.error('Нет STUDIO_BOT_TOKEN в studio-bot/.env (см. .env.example)');
    process.exit(1);
  }
  const me = await tg.call('getMe');
  if (!me.ok) process.exit(1);
  console.log(`Бот @${me.result.username} запущен.`);
  console.log(`База: заполнено ${kb.total - kb.empty} из ${kb.total} пунктов.`);
  if (!yandex.isAiConfigured()) console.warn('YandexGPT не настроен — бот будет всё передавать администратору.');
  if (!ADMIN_CHAT_ID) console.warn('ADMIN_CHAT_ID не задан — добавьте бота в группу «Админ» и напишите там /chatid.');
  setInterval(() => reportGaps().catch((err) => console.error('[gaps]', err)), 3600 * 1000);
  // Первый запуск днём — сводку «что было ночью» начинаем со следующего утра.
  if (!state.digestDate && inWorkHours(config)) state.digestDate = localDateKey(new Date(), config.timezone);
  setInterval(() => morningDigest().catch((err) => console.error('[digest]', err)), 5 * 60 * 1000);

  for (;;) {
    try {
      const r = await tg.call('getUpdates', {
        offset: state.offset, timeout: 30,
        allowed_updates: ['message', 'callback_query', 'business_connection', 'business_message'],
      }, 40000);
      if (!r.ok) { await new Promise((res) => setTimeout(res, 5000)); continue; }
      for (const u of r.result) {
        state.offset = u.update_id + 1;
        await onUpdate(u).catch((err) => console.error('[update]', err));
      }
      if (r.result.length) store.save(state);
    } catch (err) {
      console.error('[poll]', err.message);
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
}

main();
