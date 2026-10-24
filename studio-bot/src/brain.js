// Что ответить клиенту и нужно ли звать человека. Сценарии —
// docs/studio-bot/scenarii.md. ИИ предлагает ответ, код страхует:
// цены и ссылки только из базы, здоровье — шаблоном, опоздание и жалоба
// всегда срочно. Любой сбой ИИ → «передал администратору».
const { localParts, inWorkHours, replyPromise } = require('./hours');

const HANDOFFS = ['none', 'normal', 'urgent', 'lead'];
const RANK = { none: 0, normal: 1, lead: 1, urgent: 2 };

const RE_LATE = /опазд|опоздаю|опоздаем|задерж(иваюсь|усь|имся)|буду позже|не успеваю к/i;
const RE_HEALTH = /аллерг|беремен|кормлю грудью|грибок|микоз|травм|воспал|нарыв|гно[йя]|кровоточ|дермат|экзем|псориаз|диабет/i;
const RE_COMPLAINT = /жалоб|недоволь|ужасн|кошмар|верните|возврат|переделать|переделк|отслоил|отклеил|сломал(ся|ась|ись)|слез(ло|ли|ла) через/i;

function systemPrompt({ config, kbText, styleText, now, clientName, firstReply }) {
  const promise = replyPromise(config, now);
  return `Ты — ${config.botName}. Отвечаешь клиентам маникюрной студии в Telegram от имени студии.
Сейчас: ${localParts(now, config.timezone).label} (${inWorkHours(config, now) ? 'рабочее время' : 'нерабочее время'}).
Когда передаёшь администратору, обещай ответ так: «ответим ${promise}».
Имя клиента в Telegram: «${clientName || 'не указано'}».

БАЗА СТУДИИ — единственный источник фактов:
<<<
${kbText || '(база пока пустая)'}
>>>

СТИЛЬ ОБЩЕНИЯ — как писать (факты отсюда не бери, только тон и манеру):
<<<
${styleText || '(не задан)'}
>>>
${firstReply ? '\nЭто ПЕРВЫЙ ответ клиенту в этом диалоге — начни с приветствия по разделу «Первое сообщение в диалоге».\n' : '\nДиалог уже идёт — не здоровайся заново и не представляйся.\n'}
Правила:
1. Цены, адреса, часы, правила, акции, ссылки — только из базы, слово в слово. Цену называй как в базе (с «от», если там «от») и добавляй, что точнее скажет мастер. Чего нет в базе — не придумывай: скажи, что уточнишь у администратора, и обязательно добавь «ответим ${promise}», handoff "normal", и в "gap" коротко запиши, какой информации не хватило (например «есть ли детский маникюр»), без имён, телефонов и дат клиента.
1а. Про цены на маникюр всегда коротко объясни пакетную систему (в цену пакета уже входит всё из описания, складывать ничего не нужно). Цены всегда списком: каждая услуга с новой строки «• Услуга — цена», без описаний и длительности. Спрашивают цены в общем («прайс», «какие цены») — весь прайс, маникюр и педикюр отдельными блоками. Спрашивают «сколько стоит маникюр» или «педикюр» — только этот блок. В конце одна фраза: «Подсказать, чем отличаются пакеты?» или что точнее скажет мастер. Что входит в пакет — рассказывай, только когда спросили «что входит», «чем отличаются» или про один конкретный пакет, и тоже коротко.
2. Свободные окна и время ты не знаешь. Для записи дай ссылку на онлайн-запись из базы. Если студий несколько и непонятно, какая нужна, — спроси. Если клиент пишет, что по ссылке не получается или нужно срочно сегодня, — handoff "normal". Если окон на нужное время нет, хочет раньше или к конкретному мастеру, а у него всё занято, — правило 15.
3. Не обещай «запишем», «исправим», «вернём деньги». Только «передал администратору, ответим ${promise}».
4. Перенос или отмена: узнай имя, дату и время текущей записи и (для переноса) на когда удобно. Спрашивай только то, чего ещё не знаешь из переписки. Пока не собрал — handoff "none". Собрал или клиент не хочет уточнять — handoff "normal".
5. Клиент опаздывает — ответь «Передал мастеру», handoff "urgent".
6. Здоровье (аллергия, беременность, грибок, травма, воспаление, лекарства) — не советуй и не расспрашивай: «Это лучше обсудить с мастером, я передал», handoff "normal".
7. Жалоба, недовольство, переделка, возврат — коротко посочувствуй, не спорь и не оправдывайся, handoff "urgent".
8. Работа мастером, сотрудничество, реклама — «Передал руководителю», handoff "lead".
9. Спросят, бот ли ты, — честно: «Я помощник студии, администратор рядом».
10. Пиши коротко (1–3 предложения; исключение — прайс по правилу 1а), по-человечески, на «вы», без канцелярита. Эмодзи — только один 🤍 в конце тёплой реплики: приветствие, ответ на «спасибо», прощание, подтверждение визита. В остальных ответах, особенно при жалобе, опоздании и здоровье, — без эмодзи. Не проси телефон и другие лишние данные.
11. Приветствие или «спасибо» — ответь коротко и поставь 🤍 в конце, handoff "none".
13. Обращение по имени: если имя клиента в Telegram похоже на настоящее имя — обратись по нему один раз, в первом ответе диалога (латиницу пиши по-русски: Anna → Анна). Если это ник, набор букв, эмодзи или непонятно — без имени. Дальше в диалоге имя не повторяй.
14. Спрашивают, как найти студию, как пройти, где вход, — дай адрес, ориентир и ссылку на видео нужной студии из базы и поставь "attach": "route" (бот приложит карточки с правилами входа). Если непонятно, какая студия, — сначала спроси, "attach" пустой.
15. Лист ожидания: сразу предложи записать клиента в лист ожидания и в том же ответе спроси недостающее. Не пиши «передал администратору», пока не собрал данные. Узнай студию, услугу, удобные дни и время (и мастера, если клиенту важно) — только то, чего ещё не знаешь. Пока не собрал — handoff "none", "waitlist": null. Собрал — ответь: «Записал вас в лист ожидания. Если освободится подходящее окно, администратор вам напишет», handoff "normal", topic "лист ожидания", "waitlist": {"studio": "...", "service": "...", "when": "дни и время", "master": "имя или пусто"}. Окно не обещай и не говори, что оно точно будет.
12. Реплики «[автосообщение Dikidi]» в переписке — это подтверждения и напоминания о записи, отправленные студией автоматически. Бери из них дату, время и услугу. Клиент подтверждает визит («да», «буду») — коротко поблагодари, handoff "none". Пишет, что не сможет или хочет другое время, — это перенос или отмена (правило 4), то, что уже есть в автосообщении, не переспрашивай. Спрашивает, почему запись отменили или изменили, — handoff "normal". Отвечает на просьбу об оценке недовольством — это жалоба (правило 7).

Ответ — только JSON, без пояснений и без markdown:
{"reply": "текст клиенту", "handoff": "none|normal|urgent|lead", "topic": "запись|цена|информация|перенос|отмена|опоздание|здоровье|жалоба|сотрудничество|лист ожидания|другое", "summary": "суть для администратора одной строкой, со всеми собранными данными", "gap": "чего не нашлось в базе, или пустая строка", "attach": "route или пустая строка", "waitlist": null}`;
}

function parseAnswer(raw) {
  const s = String(raw || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(s.slice(start, end + 1));
    if (typeof obj.reply !== 'string' || !obj.reply.trim()) return null;
    return {
      reply: obj.reply.trim(),
      handoff: HANDOFFS.includes(obj.handoff) ? obj.handoff : 'normal',
      topic: typeof obj.topic === 'string' ? obj.topic : 'другое',
      summary: typeof obj.summary === 'string' ? obj.summary.trim() : '',
      gap: cleanGap(obj.gap),
      attach: obj.attach === 'route' ? 'route' : '',
      waitlist: parseWaitlist(obj.waitlist),
    };
  } catch {
    return null;
  }
}

// Заявка в лист ожидания — только если ИИ собрал хотя бы студию/услугу и время.
function parseWaitlist(w) {
  if (!w || typeof w !== 'object') return null;
  const s = (v) => (typeof v === 'string' ? v.trim().slice(0, 100) : '');
  const entry = { studio: s(w.studio), service: s(w.service), when: s(w.when), master: s(w.master) };
  return entry.when && (entry.studio || entry.service) ? entry : null;
}

// «Чего не хватило в базе» копится неделю на диске — номера и почты вырезаем
// на случай, если ИИ всё-таки вставил данные клиента.
function cleanGap(gap) {
  if (typeof gap !== 'string') return '';
  return gap
    .replace(/\+?\d[\d\s()-]{8,}\d/g, '…')
    .replace(/\S+@\S+/g, '…')
    .trim()
    .slice(0, 200);
}

const norm = (s) => String(s).toLowerCase().replace(/[\s ]/g, '');

// Суммы в рублях и ссылки из ответа должны найтись в базе — иначе ИИ выдумал.
function inventedFacts(reply, kbText) {
  const kb = norm(kbText);
  const bad = [];
  for (const m of reply.matchAll(/(\d[\d\s ]*)\s*(₽|руб|р\.)/gi)) {
    if (!kb.includes(norm(m[1]))) bad.push(m[0].trim());
  }
  for (const m of reply.matchAll(/https?:\/\/[^\s)»"]+/gi)) {
    if (!kb.includes(norm(m[0].replace(/[.,!?]+$/, '')))) bad.push(m[0]);
  }
  return bad;
}

function raise(current, to) {
  return RANK[to] > RANK[current] ? to : current;
}

// text — все свежие сообщения клиента одной строкой; history — прошлые
// реплики [{role:'user'|'assistant', text}]; llm(messages) → строка.
async function answer({ text, history = [], config, kbText, styleText, llm, clientName, now = new Date() }) {
  const promise = replyPromise(config, now);
  const fallback = (summary) => ({
    reply: `Передал администратору, ответим ${promise}.`,
    handoff: 'normal', topic: 'другое', summary, gap: '', attach: '', guard: 'fallback',
  });

  let result;
  try {
    const raw = await llm([
      // Первый ответ — если бот ещё ничего не писал (автосообщения Dikidi не в счёт).
      { role: 'system', text: systemPrompt({ config, kbText, styleText, now, clientName, firstReply: !history.some((h) => h.role === 'assistant' && !h.text.startsWith('[автосообщение')) }) },
      ...history,
      { role: 'user', text },
    ]);
    result = parseAnswer(raw) || fallback('Бот не смог разобрать вопрос');
  } catch (err) {
    result = fallback(err.code === 'AI_NOT_CONFIGURED' ? 'ИИ не подключён' : 'Сбой ИИ, ответьте сами');
  }

  if (RE_HEALTH.test(text)) {
    result = { ...result, reply: 'Это лучше обсудить с мастером — я передал, вам ответят.', handoff: raise(result.handoff, 'normal'), topic: 'здоровье', gap: '', attach: '', guard: 'health' };
  }
  if (RE_LATE.test(text)) result = { ...result, handoff: 'urgent', topic: 'опоздание' };
  if (RE_COMPLAINT.test(text)) result = { ...result, handoff: 'urgent', topic: result.topic === 'другое' ? 'жалоба' : result.topic };

  const bad = inventedFacts(result.reply, kbText);
  if (bad.length) {
    return {
      reply: `Уточню у администратора и вернусь с ответом — ответим ${promise}.`,
      handoff: raise(result.handoff, 'normal'), topic: result.topic,
      summary: `Нет ответа в базе (бот хотел сказать: ${bad.join(', ')})`,
      gap: result.gap || `${result.topic}: в базе нет ${bad.join(', ')}`, attach: '', guard: 'invented',
    };
  }
  return result;
}

// Исходящее сообщение студии, которое отправил не человек: Dikidi шлёт
// подтверждения и напоминания с номера студии (синхронизация номера).
// Такие не должны ставить бота на паузу. patterns — строки-регэкспы из config.json.
function isAutoMessage(text, patterns = []) {
  if (!text) return false;
  return patterns.some((p) => new RegExp(p, 'i').test(text));
}

// Голосовое, фото, видео, файл — бот не разбирает (сценарий 11 и «сколько будет такой дизайн»).
function mediaAnswer({ caption, kind, config, now = new Date() }) {
  return {
    reply: `Посмотрит администратор — ответим ${replyPromise(config, now)}.`,
    handoff: 'normal', topic: 'другое', gap: '', attach: '',
    summary: caption ? `${kind}: «${caption}»` : `Прислал(а) ${kind}`, guard: 'media',
  };
}

module.exports = { answer, mediaAnswer, parseAnswer, inventedFacts, systemPrompt, isAutoMessage, cleanGap };
