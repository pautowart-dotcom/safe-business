const test = require('node:test');
const assert = require('node:assert');
const brain = require('../src/brain');
const { cleanKb } = require('../src/kb');
const { inWorkHours, replyPromise } = require('../src/hours');

const config = {
  botName: 'помощник студии', timezone: 'Europe/Moscow',
  workHours: { from: '10:00', to: '21:00' }, replyPromise: 'в течение часа',
};
const kbText = '- Маникюр с покрытием: от 2 000 ₽\n- Онлайн-запись: https://dikidi.net/123';
const DAY = new Date('2026-10-24T09:00:00Z'); // 12:00 по Москве
const NIGHT = new Date('2026-10-24T21:00:00Z'); // 00:00 по Москве

const llmSays = (obj) => async () => (typeof obj === 'string' ? obj : JSON.stringify(obj));
const ask = (text, llm, now = DAY) => brain.answer({ text, config, kbText, llm, now });

test('цена из базы проходит как есть', async () => {
  const r = await ask('Сколько стоит?', llmSays({ reply: 'Маникюр с покрытием — от 2 000 ₽, точнее скажет мастер.', handoff: 'none', topic: 'цена', summary: '' }));
  assert.equal(r.handoff, 'none');
  assert.match(r.reply, /2 000 ₽/);
});

test('выдуманная цена → «уточню» и карточка', async () => {
  const r = await ask('А наращивание?', llmSays({ reply: 'Наращивание — 3500 руб.', handoff: 'none', topic: 'цена', summary: '' }));
  assert.equal(r.guard, 'invented');
  assert.equal(r.handoff, 'normal');
  assert.doesNotMatch(r.reply, /3500/);
});

test('выдуманная ссылка → карточка', async () => {
  const r = await ask('Где записаться?', llmSays({ reply: 'Вот: https://dikidi.net/999', handoff: 'none', topic: 'запись', summary: '' }));
  assert.equal(r.guard, 'invented');
});

test('ссылка из базы с точкой в конце проходит', async () => {
  const r = await ask('Где записаться?', llmSays({ reply: 'Запись здесь: https://dikidi.net/123.', handoff: 'none', topic: 'запись', summary: '' }));
  assert.equal(r.guard, undefined);
});

test('здоровье — шаблон без советов, даже если ИИ решил посоветовать', async () => {
  const r = await ask('У меня аллергия на гель-лак', llmSays({ reply: 'Попробуйте гипоаллергенный лак.', handoff: 'none', topic: 'услуга', summary: 'аллергия' }));
  assert.equal(r.topic, 'здоровье');
  assert.equal(r.handoff, 'normal');
  assert.match(r.reply, /мастером/);
});

test('опоздание всегда срочно', async () => {
  const r = await ask('Опаздываю на 10 минут', llmSays({ reply: 'Передал мастеру.', handoff: 'normal', topic: 'опоздание', summary: '' }));
  assert.equal(r.handoff, 'urgent');
});

test('жалоба всегда срочно', async () => {
  const r = await ask('Покрытие отслоилось через два дня', llmSays({ reply: 'Мне жаль, передал администратору.', handoff: 'normal', topic: 'другое', summary: '' }));
  assert.equal(r.handoff, 'urgent');
  assert.equal(r.topic, 'переделка');
});

test('ответ ИИ в ```json``` разбирается', async () => {
  const r = await ask('Цена?', llmSays('```json\n{"reply":"Маникюр — от 2 000 ₽.","handoff":"none","topic":"цена","summary":""}\n```'));
  assert.match(r.reply, /Маникюр — от 2 000 ₽\.$/);
});

test('первый ответ — приветствие кодом, своё приветствие ИИ убираем', async () => {
  const r = await ask('Добрый день! Переживаю, что не успею к 19:00', llmSays({ reply: 'Добрый день! Это служба заботы «Фабрика маникюра» 🤍 Спасибо, что предупредили!', handoff: 'none', topic: 'перенос', summary: '' }));
  assert.match(r.reply, /^Здравствуйте! На связи бот-помощник Службы заботы/);
  assert.match(r.reply, /Администратор тоже на связи/);
  assert.match(r.reply, /\n\nСпасибо, что предупредили!$/);
  assert.equal((r.reply.match(/Здравствуйте|Добрый день/g) || []).length, 1);
});

test('приветствие: зовём человека — без второй фразы про админа; жалоба — без 🤍; ночью — утро', async () => {
  const r = await ask('Надломился ноготь, можно переделать?', llmSays({ reply: 'Мы постараемся максимально оперативно решить ваш вопрос — администратор подключится в ближайшее время.', handoff: 'urgent', topic: 'жалоба', summary: '' }));
  assert.doesNotMatch(r.reply, /🤍|тоже на связи/);
  assert.match(brain.greeting(config, NIGHT), /подключится утром, после 10:00/);
  const hi = await ask('Здравствуйте', llmSays({ reply: 'Здравствуйте!', handoff: 'none', topic: 'другое', summary: '' }));
  assert.match(hi.reply, /\n\nПодскажу по услугам/);
});

test('шаблонные ситуации — без ИИ', async () => {
  const noLlm = async () => { throw new Error('ИИ не должен вызываться'); };
  const cases = [
    ['Опаздываю на 10 минут', 'опоздание', 'urgent'],
    ['Подскажите, есть ли возможность завтра подойти на переделку одного ногтя? Чуть надломился', 'переделка', 'urgent'],
    ['Мне очень не понравилось, хочу вернуть деньги', 'жалоба', 'urgent'],
    ['Извините, что-то не складывается, отмените пожалуйста', 'отмена', 'normal'],
    ['я забыла в какую я записывалась', 'своя запись', 'normal'],
    ['в которую я записана?', 'своя запись', 'normal'],
    ['Я беременна, можно делать маникюр?', 'здоровье', 'normal'],
  ];
  for (const [text, topic, handoff] of cases) {
    const r = await ask(text, noLlm);
    assert.equal(r.guard, 'template', text);
    assert.equal(r.topic, topic, text);
    assert.equal(r.handoff, handoff, text);
  }
  assert.match((await ask('Отмените запись', noLlm)).reply, /каждое окошко/);
});

test('похоже на шаблон, но решает ИИ: перенос, «почему отменили», обычные вопросы', () => {
  for (const t of ['Не смогу прийти, можно перенести на пятницу?', 'Почему отменили мою запись?', 'Сколько стоит маникюр?', 'Переживаю, что могу не успеть, есть окошко на 19:00?', 'Хочу записаться на маникюр'])
    assert.equal(brain.templateAnswer(t, 'в ближайшее время'), null, t);
});

test('диалог идёт — без приветствия', async () => {
  const r = await brain.answer({ text: 'А цена?', history: [{ role: 'user', text: 'Привет' }, { role: 'assistant', text: 'Здравствуйте!' }], config, kbText, llm: llmSays({ reply: 'Маникюр — от 2 000 ₽.', handoff: 'none', topic: 'цена', summary: '' }), now: DAY });
  assert.equal(r.reply, 'Маникюр — от 2 000 ₽.');
});

test('мусор от ИИ → передаём человеку', async () => {
  const r = await ask('Привет', llmSays('не знаю'));
  assert.equal(r.guard, 'fallback');
  assert.equal(r.handoff, 'normal');
});

test('ИИ упал → передаём человеку, ночью обещаем утро', async () => {
  const r = await ask('Привет', async () => { throw new Error('timeout'); }, NIGHT);
  assert.equal(r.handoff, 'normal');
  assert.match(r.reply, /утром, после 10:00/);
});

test('ИИ упал, а клиент опаздывает → всё равно срочно', async () => {
  const r = await ask('Опаздываю', async () => { throw new Error('timeout'); });
  assert.equal(r.handoff, 'urgent');
  assert.equal(r.topic, 'опоздание');
});

test('сообщение Dikidi с номера студии — автоматическое, живой ответ админа — нет', () => {
  const patterns = ['dikidi'];
  assert.equal(brain.isAutoMessage('Вы записаны на 25.10 в 14:00. Отменить: https://dikidi.net/r/abc', patterns), true);
  assert.equal(brain.isAutoMessage('Добрый день! Да, окно есть', patterns), false);
  assert.equal(brain.isAutoMessage('', patterns), false);
});

test('реальные шаблоны Dikidi «Фабрики» узнаются, живые ответы админа — нет', () => {
  const { autoMessagePatterns: p } = require('../src/kb').loadConfig();
  const dikidi = [
    'Здравствуйте 🥰🤍 Вы записаны 12 дек в 17:30. Пожалуйста подтвердите свой визит https://dkd.su/12345q Фабрика маникюра',
    'Вы записались к специалисту "Анна" на 12 дек в 17:30. Фабрика маникюра С любовью и заботой',
    'Записали Вас к специалисту "Анна" на 12 дек в 17:30. Маникюр.',
    'Изменена запись к сотруднику Анна на 12 дек в 17:30 (Фабрика маникюра)',
    'Отменена запись к специалисту "Анна" на 12 дек в 17:30. Фабрика маникюра',
    'Фабрика маникюра ждет Вас 12 дек в 17:30. По адресу: Большая Марфинская 4к7 +79263365868',
    'Ваши ручки — наша маленькая гордость. Оставить оценку мастеру: https://dkd.su/12345q',
  ];
  for (const t of dikidi) assert.equal(brain.isAutoMessage(t, p), true, t);
  for (const t of ['Добрый день! Окошко есть завтра в 15:00', 'Вы записаны, ждём вас', 'Перенесла вас на пятницу'])
    assert.equal(brain.isAutoMessage(t, p), false, t);
});

test('«как пройти» → приложить карточки, пробел в базе → в список без телефона', async () => {
  const r = await ask('Как к вам пройти?', llmSays({ reply: 'Вход со двора, видео: https://dikidi.net/123', handoff: 'none', topic: 'информация', summary: '', gap: '', attach: 'route' }));
  assert.equal(r.attach, 'route');
  const g = await ask('Есть детский маникюр? мой номер +7 926 111 22 33', llmSays({ reply: 'Уточню у администратора.', handoff: 'normal', topic: 'информация', summary: '', gap: 'детский маникюр, клиент +7 926 111 22 33', attach: '' }));
  assert.match(g.gap, /детский маникюр/);
  assert.doesNotMatch(g.gap, /926/);
});

test('выдуманная цена попадает в список «не хватило»', async () => {
  const r = await ask('Сколько дизайн?', llmSays({ reply: 'Дизайн — 300 ₽ за ноготь.', handoff: 'none', topic: 'цена', summary: '', gap: '', attach: '' }));
  assert.match(r.gap, /300 ₽/);
});

test('имя клиента уходит в промпт', () => {
  const p = brain.systemPrompt({ config, kbText, now: DAY, clientName: 'Anna' });
  assert.match(p, /«Anna»/);
  assert.match(p, /ник/);
});

test('лист ожидания: заявка только когда собраны время и студия/услуга', async () => {
  const done = await ask('Пятница после 18, Ивовая, маникюр', llmSays({ reply: 'Записал вас в лист ожидания. Если освободится подходящее окно, администратор вам напишет.', handoff: 'normal', topic: 'лист ожидания', summary: '', gap: '', attach: '', waitlist: { studio: 'Ивовая', service: 'маникюр', when: 'пятница после 18:00', master: '' } }));
  assert.deepEqual(done.waitlist, { studio: 'Ивовая', service: 'маникюр', when: 'пятница после 18:00', master: '' });
  const half = await ask('Хочу раньше', llmSays({ reply: 'В какой студии и когда удобно?', handoff: 'none', topic: 'лист ожидания', summary: '', gap: '', attach: '', waitlist: { studio: 'Ивовая', when: '' } }));
  assert.equal(half.waitlist, null);
});

test('дата студии для утренней сводки — по Москве', () => {
  const { localDateKey } = require('../src/hours');
  assert.equal(localDateKey(new Date('2026-10-24T22:30:00Z'), 'Europe/Moscow'), '2026-10-25');
});

test('приветствие только в первом ответе, автосообщение Dikidi не считается ответом бота', async () => {
  let sys = '';
  const spy = async (msgs) => { sys = msgs[0].text; return JSON.stringify({ reply: 'Ок', handoff: 'none', topic: 'другое', summary: '' }); };
  await brain.answer({ text: 'Привет', history: [], config, kbText, llm: spy, now: DAY });
  assert.match(sys, /ПЕРВЫЙ ответ/);
  await brain.answer({ text: 'Не смогу', history: [{ role: 'assistant', text: '[автосообщение Dikidi] Вы записаны…' }], config, kbText, llm: spy, now: DAY });
  assert.match(sys, /ПЕРВЫЙ ответ/);
  await brain.answer({ text: 'А цена?', history: [{ role: 'user', text: 'Привет' }, { role: 'assistant', text: 'Здравствуйте!' }], config, kbText, llm: spy, now: DAY });
  assert.match(sys, /не здоровайся заново/);
});

test('латинские имена из Telegram → по-русски, ник и кириллица не трогаются', () => {
  const n = brain.nameForGreeting;
  assert.equal(n('Alisa'), 'Алиса');
  assert.equal(n('Artem Pautov'), 'Артём');
  assert.equal(n('Andrey'), 'Андрей');
  assert.equal(n('Ksenia'), 'Ксения');
  assert.equal(n('Анна Петрова'), 'Анна');
  assert.equal(n('kitty_99'), 'kitty_99');
  assert.equal(n(''), '');
});

test('голосовое → карточка', () => {
  const r = brain.mediaAnswer({ caption: '', kind: 'голосовое', config, now: DAY });
  assert.equal(r.handoff, 'normal');
  assert.match(r.summary, /голосовое/);
});

test('рабочие часы по Москве', () => {
  assert.equal(inWorkHours(config, DAY), true);
  assert.equal(inWorkHours(config, NIGHT), false);
  assert.equal(replyPromise(config, DAY), 'в течение часа');
});

test('заглушки [ЗАПОЛНИТЬ] не попадают в базу для ИИ', () => {
  const kb = cleanKb('# База\n- Адрес: [ЗАПОЛНИТЬ]\n- Цена: от 2 000 ₽');
  assert.doesNotMatch(kb.text, /ЗАПОЛНИТЬ|Адрес/);
  assert.equal(kb.total, 2);
  assert.equal(kb.empty, 1);
});

test('«[ссылка]» после адреса → ссылка Dikidi из базы', () => {
  const kb = cleanKb(require('fs').readFileSync(require('path').join(__dirname, '..', 'baza.md'), 'utf8')).text;
  const r = brain.fillLinks('Вы можете сами изменить запись по ссылке: Большая Марфинская, д. 4, к. 7 — [ссылка], Ивовая улица, д. 6, к. 1 — [ссылка]. Если удобнее, администратор поможет.', kb);
  assert.match(r, /Большая Марфинская, д\. 4, к\. 7 — https:\/\/dikidi\.net\/731427/);
  assert.match(r, /Ивовая улица, д\. 6, к\. 1 — https:\/\/dikidi\.net\/863138/);
  assert.doesNotMatch(r, /\[ссылка\]/);
  assert.deepEqual(brain.inventedFacts(r, kb), []);
});

test('«[ссылка]» без адреса → обе студии', () => {
  const kb = cleanKb(require('fs').readFileSync(require('path').join(__dirname, '..', 'baza.md'), 'utf8')).text;
  const r = brain.fillLinks('Записаться можно по ссылке: [ссылка на запись]', kb);
  assert.match(r, /731427/);
  assert.match(r, /863138/);
});
