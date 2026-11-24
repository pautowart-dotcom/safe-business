// Правила переписки бота, без базы и без модели.
// Модель говорит только там, где правило вернуло instruction, а не fixedReply.
// Цена и отказ «я не человек с именем» здесь нарочно фиксированы:
// модель их путает.

const PRICE = '1 990 ₽ в месяц';

function moscowDate(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(now);
}

function norm(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .replace(/[!?.…,]+$/g, '')
    .trim();
}

const GREETINGS = [
  'доброго времени суток', 'добрый день', 'добрый вечер', 'доброе утро', 'доброй ночи',
  'здравствуйте', 'здравствуй', 'привет', 'салют', 'здарова', 'hello', 'hi', 'хай',
];

function splitGreeting(n) {
  if (/^\/start(\s|$)/.test(n)) {
    return { greeting: true, rest: n.replace(/^\/start\s*/, '').trim() };
  }
  for (const g of GREETINGS) {
    if (n === g) return { greeting: true, rest: '' };
    if (n.startsWith(`${g} `) || n.startsWith(`${g},`)) {
      return { greeting: true, rest: n.slice(g.length).replace(/^[\s,]+/, '') };
    }
  }
  return { greeting: false, rest: n };
}

function classify(n) {
  if (!n) return 'empty';
  if (/ты бот|ты ии|ты нейро|ты робот|искусственн|это бот|это ии|живой человек|оператор|позови человек|передайте человеку|передай человеку/.test(n)) return 'identity';
  if (/^\/start(\s|$)/.test(n) || GREETINGS.includes(n)) return 'greeting';
  if (/^(спасибо|благодарю|спс|пасиб)$/.test(n)) return 'thanks';
  if (/^(пока|до свидания|всего доброго|до связи)$/.test(n)) return 'bye';
  if (/^(да|ок|окей|хорошо|ладно|угу|ага|нет|не надо|не хочу|неа)$/.test(n)) return 'short';
  if (/не работает|ошибк|не открыва|не могу войти|не пускает|парол|поддержк|баг|завис|оплат[аи] не прошла|деньги списал/.test(n)) return 'support';
  if (/цена|сколько стоит|стоимость|тариф|подписк|сколько это|как оплатить|где оплатить/.test(n)) return 'price';
  if (/мои срок|что в кабинете|в кабинете|мои нарушен|что у меня (не закрыто|просроч)|какие у меня срок|что просрочено/.test(n)) return 'cabinet';
  if (/штраф|стать[ьяею]|коап|санпин|что (именно )?делать|как оформить|как исправить|какая норма|какой закон|какие документ|что грозит|делать|как закрыть|какие бумаги|чек коррекции|чек коррек|кассов|пробить чек|пробила чек|забыл[аи]? пробить|офд|медкниж|огнетуш|патент|оквэд|эцп|вывеск|стерилиз/.test(n)) return 'advice';
  if (/дорого|подумаю|не сейчас|позже|нет денег|не буду платить/.test(n)) return 'objection';
  if (/как (это|вы) работ|как устроен|что вы делаете|что умеешь|чем полез|для чего вы|что даст|что даёт|что получ|зачем (вы|это|мне)|что это/.test(n)) return 'how';
  if (/идиот|дурак|нафиг|пошел ты|пошла ты|достал|бесите|мошенн/.test(n)) return 'anger';
  return 'talk';
}

function alreadyRepeatedHello(recent) {
  return recent.some((m) => m.role === 'bot' && /уже здоровались/.test(m.text || ''));
}

function lastUserText(recent) {
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    if (recent[i].role === 'user') return norm(recent[i].text);
  }
  return '';
}

const SPHERES = [
  { id: 'beauty', name: 'Красота', test: /маникюр|педикюр|ногт|ресниц|брови|парикмах|барбер|косметолог|тату|депиляц|соляри|(?<![а-я])салон|красот/, papers: ['Медкнижки', 'Журнал стерилизации', 'Договор на вывоз отходов'] },
  { id: 'food', name: 'Еда', test: /кофе|кафе|общепит|пекар|кондитер|стрит|шаурм|фудтрак|столов|(^|[^а-я])еда([^а-я]|$)|еды|еду/, papers: ['Медкнижки', 'Санитарные журналы', 'Меню и сроки по точке'] },
  { id: 'auto', name: 'Авто', test: /автосервис|автомой|шиномонтаж|автосерв/, papers: ['Документы на помещение', 'Договор на отходы', 'Касса'] },
  { id: 'cleaning', name: 'Клининг', test: /клининг|уборк|фасад/, papers: ['Договор с клиентом', 'Документы на химию', 'Документы на сотрудников'] },
  { id: 'kids', name: 'Детские занятия', test: /детск|кружок/, papers: ['Документы на помещение', 'Документы на сотрудников', 'Документы для работы с детьми'] },
  { id: 'fitness', name: 'Фитнес', test: /фитнес|тренаж|йог|пилатес|танц|единобор|бокс/, papers: ['Документы на помещение', 'Документы на сотрудников', 'Документы точки'] },
  { id: 'pets', name: 'Животные', test: /груминг|зоосалон|передержк|дрессир|животн/, papers: ['Документы на помещение', 'Договор на отходы', 'Документы точки'] },
  { id: 'shoes', name: 'Ремонт обуви', test: /ремонт обув|обувн/, papers: ['Касса', 'Документы на помещение', 'Документы на услугу'] },
  { id: 'atelier', name: 'Ателье', test: /ателье|пошив/, papers: ['Касса', 'Документы на помещение', 'Документы на услугу'] },
  { id: 'photo', name: 'Фото', test: /фотостуд|фотосъ/, papers: ['Касса', 'Документы на помещение', 'Документы на услугу'] },
  { id: 'repair', name: 'Ремонт', test: /ремонт/, papers: ['Касса', 'Документы на помещение', 'Документы на услугу'] },
];

const GENERAL_PAPERS = ['Регистрация', 'Касса', 'Сотрудники'];

function spheresIn(n) {
  const found = SPHERES.filter((s) => s.test.test(n));
  if (found.some((s) => s.id === 'shoes' || s.id === 'atelier' || s.id === 'photo')) {
    return found.filter((s) => s.id !== 'repair');
  }
  return found;
}

function pointCount(n) {
  if (/(^|\s)(две|двух|два)(\s|$)/.test(n)) return 'две точки';
  if (/(^|\s)(три|трех|трёх)(\s|$)/.test(n)) return 'три точки';
  if (/нескольк/.test(n)) return 'несколько точек';
  return '';
}

function topicName(n) {
  const map = [
    [/медкниж/, 'медкнижку'],
    [/огнетуш/, 'огнетушитель'],
    [/патент/, 'патент'],
    [/чек\S*(?:\s+коррек)?|пробить чек|пробила чек|забыл/, 'чек'],
    [/кассов|офд/, 'кассу'],
    [/оквэд/, 'ОКВЭД'],
    [/эцп|электронн/, 'электронную подпись'],
    [/вывеск/, 'вывеску'],
    [/стерилиз/, 'стерилизацию'],
    [/журнал/, 'журнал'],
    [/штраф|коап|что грозит/, 'штраф'],
    [/санпин|какая норма|какой закон/, 'норму'],
    [/какие документ|какие бумаги/, 'список документов'],
  ];
  const hit = map.find(([re]) => re.test(n));
  return hit ? hit[1] : 'этот вопрос';
}

function unpaidAdvice(said) {
  const topic = topicName(said);
  const tail = `Названия бумаг присылаю бесплатно. Что сделать — ${PRICE}.`;
  if (topic === 'норму') return `Норму отсюда не цитирую. ${tail}`;
  if (topic === 'штраф') return `Про штраф отсюда не пишу. ${tail}`;
  if (topic === 'этот вопрос') return `Шаги и норму отсюда не пишу. ${tail}`;
  return `Про ${topic} шаги и норму отсюда не пишу. ${tail}`;
}

function papersFor(sphereId) {
  const sphere = SPHERES.find((item) => item.id === sphereId);
  return sphere ? sphere.papers.slice() : GENERAL_PAPERS.slice();
}

function sphereName(sphereId) {
  return SPHERES.find((item) => item.id === sphereId)?.name || 'Общий список';
}

function lowerTitle(title) {
  const text = String(title || '').trim();
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function feedView(feed) {
  const items = feed?.items || [];
  return {
    stopped: !!feed?.stopped,
    sphereId: feed?.sphereId || null,
    items,
    active: items.length > 0 && !feed?.stopped,
    anySent: items.some((item) => item.sent),
  };
}

function openSent(items) {
  return (items || []).filter((item) => item.sent && !item.closed);
}

function feedCommand(said) {
  if (/^(хватит|стоп|не пиши|не пишите|отпиши|отпишитесь|отстань|отстаньте)(\s|$)/.test(said)) return 'stop';
  if (/^(есть|уже есть|это есть|имеется)$/.test(said)) return 'close';
  if (/^(нет|нету|пока нет)$/.test(said)) return 'leave';
  return null;
}

function titledItem(said, items) {
  if (!/есть/.test(said)) return null;
  return (items || []).find((item) => said.includes(lowerTitle(item.title))) || null;
}

function answerFeed(said, view) {
  const cmd = feedCommand(said);
  const named = titledItem(said, view.items);
  if (!cmd && !named) return null;
  if (view.stopped) {
    return {
      fixedReply: cmd === 'stop'
        ? 'Уже остановился. Сам бумаги больше не пришлю, пока не напишете, чем занимается бизнес.'
        : 'Рассылка остановлена. Напишите, чем занимается бизнес, если нужно снова.',
    };
  }
  if (!view.items.length) {
    if (cmd === 'stop') {
      return {
        feedAction: 'stop',
        fixedReply: 'Останавливаюсь. Сам бумаги больше не пришлю. Если нужно — напишите, чем занимается бизнес.',
      };
    }
    return { fixedReply: 'Сначала напишите, чем занимается бизнес. Потом пришлю бумаги сам, по одной.' };
  }
  if (cmd === 'stop') {
    return {
      feedAction: 'stop',
      fixedReply: 'Останавливаюсь. Сам бумаги больше не пришлю. Если нужно снова — напишите, чем занимается бизнес.',
    };
  }
  if (cmd === 'close' || named) {
    if (named && named.closed) return { fixedReply: `Этот пункт уже снят: ${lowerTitle(named.title)}.` };
    if (named && !named.sent) return { fixedReply: 'Эту бумагу ещё не присылал. Когда пришлю — напишите «есть», если она у вас есть.' };
    const closing = named || openSent(view.items).slice(-1)[0];
    if (!closing) return { fixedReply: 'Пока нечего снимать. Бумага придёт сама.' };
    const rest = openSent(view.items).filter((item) => item.title !== closing.title);
    const unsent = view.items.some((item) => !item.sent);
    const tail = rest.length
      ? ` Остаётся открытым: ${rest.map((item) => lowerTitle(item.title)).join(', ')}.`
      : unsent
        ? ' Следующая бумага придёт сама.'
        : ' Открытых пунктов нет. Новые сам не пришлю.';
    return {
      feedAction: 'close',
      closeTitle: closing.title,
      feedDone: !rest.length && !unsent,
      fixedReply: `Снял: ${lowerTitle(closing.title)}.${tail}`,
    };
  }
  const last = openSent(view.items).slice(-1)[0];
  return {
    feedAction: 'leave',
    fixedReply: last ? `Оставляю в списке: ${lowerTitle(last.title)}.` : 'Хорошо. Бумагу пришлю сам.',
  };
}

function businessReply(said, feed) {
  const found = spheresIn(said);
  const count = pointCount(said);
  const view = feedView(feed);
  const sphereId = found.length ? found[0].id : 'general';
  const label = !found.length
    ? 'Принял'
    : found.length > 1
      ? found.map((item) => item.name).join(' и ')
      : `${found[0].name}${count ? `, ${count}` : ''}`;

  if (!found.length && said.length < 16) {
    if (view.active) {
      return { text: `${sphereName(view.sphereId)} уже в списке. Следующая бумага придёт сама.` };
    }
    return { text: 'Напишите, чем занимается бизнес: красота, еда, клининг, авто, ремонт. Дальше бумаги пришлю сам.' };
  }
  if (view.active && view.sphereId === sphereId) {
    return { text: `${label} уже в списке. Следующая бумага придёт сама.` };
  }
  if (view.active && view.anySent) {
    return { text: `Список уже идёт: ${sphereName(view.sphereId)}. Чтобы сменить дело, напишите «хватит», потом чем занимаетесь.` };
  }
  if (found.length > 1) {
    return {
      text: `${label}. Завтра начну с ${found[0].name.toLowerCase()}: одна бумага, которую обычно не оформляют. Отвечать не нужно.`,
      action: 'start',
      sphereId,
      titles: papersFor(sphereId),
    };
  }
  if (!found.length) {
    return {
      text: 'Принял. Завтра пришлю одну бумагу из общего списка. Отвечать не нужно.',
      action: 'start',
      sphereId: 'general',
      titles: papersFor('general'),
    };
  }
  return {
    text: `${label}. Завтра пришлю одну бумагу, которую на такой точке обычно не оформляют. Отвечать не нужно.`,
    action: 'start',
    sphereId,
    titles: papersFor(sphereId),
  };
}

function decideTurn({ text, dialog, recent, companyCount, linked, aiAllowed, conclusionOpen, paid, now, feed }) {
  const n = norm(text);
  const lead = splitGreeting(n);
  const said = lead.rest || n;
  const intent = lead.greeting && !lead.rest ? 'greeting' : classify(said);
  const today = moscowDate(now || new Date());
  const state = dialog || {};
  const greetedToday = state.greetedOn === today;
  const stage = state.stage || 'new';
  const base = {
    intent,
    fixedReply: null,
    instruction: null,
    nextStage: stage,
    pain: state.pain || null,
    greetedOn: lead.greeting ? today : (state.greetedOn || null),
    needsHuman: !!state.needsHuman,
    showCabinet: false,
    useModel: false,
    loadCabinet: false,
    loadNextStep: false,
    stepResume: false,
    lookupKnowledge: false,
    interested: false,
    feedAction: null,
    feedSphere: null,
    feedTitles: null,
    closeTitle: null,
    feedDone: false,
  };

  if (/^(напомни|напоминай|напомните)$/.test(said)) {
    return { ...base, stepResume: true, loadNextStep: !!linked, showCabinet: true, fixedReply: linked ? null : 'Сначала откройте кабинет кнопкой и войдите. После этого смогу напомнить ваш пункт.' };
  }

  if (intent === 'empty') {
    return { ...base, fixedReply: 'Напишите словами, что случилось. Голосовые и картинки я пока не разбираю.' };
  }

  if (intent === 'identity') {
    return {
      ...base,
      needsHuman: true,
      showCabinet: true,
      fixedReply: /передайте человеку|передай человеку|позови человек|нужен человек|оператор/.test(said)
        ? 'Передам человеку. Напишите почту, с которой входите в кабинет, и что случилось. Пока чат не привязан к кабинету, заявку сам не создаю.'
        : 'Пишу из Без.Биз. Здесь бумаги и сроки малого бизнеса. Если нужен человек — напишите «передайте человеку» и почту кабинета.',
    };
  }

  if (intent === 'anger') {
    return {
      ...base,
      needsHuman: true,
      nextStage: 'support',
      feedAction: 'stop',
      fixedReply: 'Понимаю, что это злит. Напишите, что именно сломалось — разберу без презентации. Если нужен человек, допишите почту от кабинета.',
    };
  }

  if (intent === 'greeting') {
    if (greetedToday && alreadyRepeatedHello(recent || [])) {
      return {
        ...base,
        greetedOn: today,
        fixedReply: 'Мы сегодня уже общались. Я на связи — напишите, что случилось, без нового приветствия.',
      };
    }
    if (greetedToday) {
      return {
        ...base,
        greetedOn: today,
        fixedReply: 'Мы уже здоровались. Напишите, что разобрать.',
      };
    }
    return {
      ...base,
      greetedOn: today,
      fixedReply: state.userId
        ? 'Безопасный бизнес. Список бумаг и сроки по вашему бизнесу можно разобрать здесь. Что смотрим: чего не хватает или какой срок заканчивается?'
        : 'Безопасный бизнес.\n\nДля владельца, который ведёт дело сам. Здесь видно, какие бумаги не оформлены и какие сроки заканчиваются.\n\nБесплатно вы получаете этот список. Документы и порядок, что сделать по каждому пункту, подключаются, когда список уже ваш.\n\nНапишите, чем занимается ваш бизнес.',
    };
  }

  if (intent === 'thanks') {
    return { ...base, fixedReply: 'Пожалуйста. Если появится бумага — напишите сюда.' };
  }
  if (intent === 'bye') {
    return { ...base, feedAction: 'stop', fixedReply: 'До связи. Бумаги больше не пришлю, пока сами не напишете.' };
  }

  if (n && n === lastUserText(recent || [])) {
    return { ...base, fixedReply: 'Это сообщение уже пришло, я его вижу. Допишите, если что-то изменилось.' };
  }

  const feedAnswer = answerFeed(said, feedView(feed));
  if (feedAnswer) return { ...base, ...feedAnswer };

  if (intent === 'price') {
    let fixedReply = `Названия бумаг присылаю бесплатно. Что сделать по пункту — ${PRICE}.`;
    if (/как оплатить|где оплатить/.test(said)) {
      fixedReply = `Оплата в кабинете после входа, ${PRICE}. Названия бумаг присылаю бесплатно.`;
    } else if (/тариф|подписк/.test(said)) {
      fixedReply = `Подписка одна, ${PRICE}: что сделать по пункту. Названия бумаг бесплатные.`;
    } else if (stage === 'offered') {
      fixedReply = `Повторю коротко: ${PRICE}. Названия бумаг остаются бесплатными.`;
    }
    return { ...base, nextStage: 'offered', showCabinet: true, interested: true, fixedReply };
  }

  if (intent === 'objection') {
    let fixedReply = 'Хорошо, платить сейчас не нужно. Бумаги всё равно пришлю, по одной. Как закрывать пункт, не расписываю.';
    if (/позже|не сейчас|подумаю/.test(said)) {
      fixedReply = 'Хорошо, без оплаты. Бумаги всё равно пришлю, по одной.';
    } else if (/не буду платить/.test(said)) {
      fixedReply = 'Понял, оплату больше не предлагаю. Бумаги по делу продолжу присылать.';
    } else if (/нет денег/.test(said)) {
      fixedReply = 'Тогда без оплаты. Названия бумаг остаются бесплатными, пришлю их сам.';
    } else if (/дорого/.test(said)) {
      fixedReply = 'Хорошо, сейчас не платите. Бумаги пришлю бесплатно. Как закрывать пункт, не расписываю.';
    }
    return { ...base, nextStage: stage === 'new' ? 'listening' : stage, interested: true, fixedReply };
  }

  if (intent === 'how') {
    return {
      ...base,
      nextStage: stage === 'new' ? 'listening' : stage,
      showCabinet: true,
      interested: true,
      fixedReply: 'Я сам присылаю по одной бумаге. «Есть» снимает пункт, «хватит» останавливает. Что сделать по пункту — после оплаты.',
    };
  }

  if (intent === 'support') {
    let fixedReply = 'Напишите, на каком экране это случилось. Отсюда я кабинет не чиню и не говорю, что ошибка уже исправлена.';
    if (/оплат|деньги списал/.test(said)) {
      fixedReply = 'Оплату отсюда не вижу и сам не возвращаю. Напишите почту кабинета и дату платежа — передам человеку.';
    } else if (/войти|парол|не пускает/.test(said)) {
      fixedReply = 'Вход в кабинет — по почте и паролю, кнопка ниже. Если пароль не подходит, на экране входа есть восстановление. Напишите почту, если письмо не приходит.';
    } else if (/завис/.test(said)) {
      fixedReply = 'Напишите, на каком экране зависло. Отсюда я это не чиню и не говорю, что уже починил.';
    } else if (/ошибк/.test(said)) {
      fixedReply = 'Напишите, какая ошибка на экране и на каком шаге. Отсюда я её не исправляю.';
    }
    return { ...base, nextStage: 'support', needsHuman: /оплат|деньги списал/.test(said) || base.needsHuman, showCabinet: true, fixedReply };
  }

  if (intent === 'short') {
    const yes = /^(да|ок|окей|хорошо|ладно|угу|ага)$/.test(n);
    if (!yes) {
      return {
        ...base,
        feedAction: 'stop',
        fixedReply: 'Останавливаюсь. Сам бумаги больше не пришлю. Если нужно снова — напишите, чем занимается бизнес.',
      };
    }
    const active = feedView(feed).active;
    return {
      ...base,
      fixedReply: active
        ? 'Хорошо. Бумаги пришлю сам.'
        : 'Хорошо. Напишите, чем занимается бизнес, и дальше пришлю бумаги сам.',
    };
  }

  if (intent === 'advice') {
    if (!paid) {
      return {
        ...base,
        showCabinet: true,
        interested: true,
        fixedReply: unpaidAdvice(said),
      };
    }
    if (!linked) {
      return {
        ...base,
        showCabinet: true,
        fixedReply: 'Чтобы ответить по вашему бизнесу, откройте кабинет кнопкой и войдите. Без этого я не вижу, оплачено ли.',
      };
    }
    return { ...base, lookupKnowledge: true };
  }

  if (intent === 'cabinet') {
    if (!linked) {
      return {
        ...base,
        showCabinet: true,
        fixedReply: 'Этот чат ещё не привязан к кабинету. Откройте кабинет кнопкой и войдите один раз — после этого смогу назвать ваши сроки. Чужие и неоплаченные подробности не читаю.',
      };
    }
    return { ...base, loadCabinet: true, showCabinet: true };
  }

  const heard = String(text || '').trim().replace(/\s+/g, ' ');
  const found = spheresIn(said);
  const count = pointCount(said);
  let pain = state.pain || null;
  if (found.length) pain = `${found.map((s) => s.name).join(' и ')}${count ? `, ${count}` : ''}`;
  else if (said.length >= 3) pain = heard.slice(0, 280);

  if (/^список$|хочу список|дайте список|покажи список/.test(said)) {
    const open = openSent(feedView(feed).items);
    const fixedReply = !feedView(feed).items.length
      ? 'Список ещё пуст. Напишите, чем занимается бизнес — завтра пришлю первую бумагу.'
      : open.length
        ? `Открыто ${open.length}: ${open.map((item) => lowerTitle(item.title)).join(', ')}. Остальное пришлю сам.`
        : 'Пока открытых бумаг нет. Следующую пришлю сам.';
    return {
      ...base,
      nextStage: 'listening',
      pain,
      interested: true,
      fixedReply,
    };
  }

  if (intent === 'talk' && said.length >= 3) {
    if (linked && companyCount > 1) {
      return {
        ...base,
        nextStage: 'listening',
        pain,
        showCabinet: true,
        fixedReply: 'Точек несколько. Напишите название, о какой напомнить пункт.',
      };
    }
    if (linked && companyCount === 1) {
      return { ...base, nextStage: 'listening', pain, loadNextStep: true, showCabinet: true };
    }
    const business = businessReply(said, feed);
    return {
      ...base,
      nextStage: 'listening',
      pain,
      interested: true,
      feedAction: business.action || null,
      feedSphere: business.sphereId || null,
      feedTitles: business.titles || null,
      fixedReply: business.text,
    };
  }

  if (stage === 'offered') {
    return {
      ...base,
      pain,
      fixedReply: 'Бумаги пришлю сам, по одной. «Есть» снимает пункт. Что сделать по пункту — только после оплаты.',
    };
  }

  if (linked && companyCount === 1) {
    return { ...base, pain, loadNextStep: true, showCabinet: true };
  }
  return {
    ...base,
    nextStage: stage === 'new' && said.length >= 3 ? 'listening' : stage,
    pain,
    fixedReply: 'Напишите, чем занимается бизнес. Дальше бумаги пришлю сам, по одной.',
  };
}

function sanitizeReply(text, instruction) {
  let reply = String(text || '').trim();
  reply = reply.replace(/```[\s\S]*?```/g, '').trim();
  const sentences = reply.split(/(?<=[.!?])\s+/).filter((s) => !/языковая модель|языковой модели|искусственный интеллект|я ии|как ии|я бот|нейросет/i.test(s));
  reply = sentences.join(' ').trim();
  if (instruction && /не здоровайся/i.test(instruction)) {
    reply = reply.replace(/^(здравствуйте|привет|добрый день|добрый вечер|доброе утро)[.!]?\s*/i, '').trim();
  }
  reply = reply.split(/(?<=[.!?])\s+/).filter((s) => !/штраф|коап|санпин|стать[ьяею]|норм[аеуы]|всё в порядке|все в порядке/i.test(s)).join(' ').trim();
  if (instruction && /не называй цену/i.test(instruction)) {
    reply = reply.split(/(?<=[.!?])\s+/).filter((s) => !/1\s*990|₽|руб/i.test(s)).join(' ').trim();
  } else if (instruction && instruction.includes(PRICE)) {
    reply = reply.replace(/\d[\d\s]{0,8}₽/g, PRICE);
    if (!/1\s*990/.test(reply)) reply = `${reply} Вести сроки дальше — ${PRICE}.`.trim();
  }
  if (reply.length > 700) {
    const cut = reply.slice(0, 700);
    const dot = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
    reply = (dot > 200 ? cut.slice(0, dot + 1) : cut).trim();
  }
  return reply;
}

module.exports = { decideTurn, sanitizeReply, norm, moscowDate, PRICE };
