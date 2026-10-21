// Справочник на сайте из карточек знаний (план этапа 2, Д4 + Д7, 13.10.2026).
// Текст живёт в одном месте — modules/knowledge-cards; эта команда собирает из
// него статические страницы в landing/spravochnik/, nginx отдаёт их как
// остальной лендинг (location / → landing). Руками HTML справочника не
// правим — правим карточку и запускаем заново:
//
//   node src/scripts/buildSpravochnik.js
//
// Что попадает на сайт — правило docs/sait/besplatno-platno.md: одна страница —
// один вопрос, общий ответ («от чего зависит»), без ответа под конкретную
// студию. Черновики и устаревшие карточки не публикуются — тот же фильтр, что
// у ИИ (getCardsForAi).
const fs = require('fs');
const path = require('path');
const cardsRepository = require('../modules/knowledge-cards/repository');
const securityContent = require('../modules/security/content/repository');
const { resolveSource } = require('../modules/knowledge-cards/norms');
const changes = require('../modules/knowledge-cards/changes');

const LANDING_DIR = path.join(__dirname, '../../../landing');
const OUT_DIR = path.join(LANDING_DIR, 'spravochnik');
const NICHE_OUT_DIR = path.join(LANDING_DIR, 'proverki');
const SITE = 'https://business-safe.ru';

const TOPICS = {
  registration: { slug: 'registraciya', title: 'Регистрация и статус' },
  cash: { slug: 'kassa', title: 'Касса и чеки' },
  taxes: { slug: 'nalogi', title: 'Налоги' },
  staff: { slug: 'sotrudniki', title: 'Сотрудники и мастера' },
  premises: { slug: 'pomeshchenie', title: 'Помещение и вывеска' },
  sanitary: { slug: 'sanitariya', title: 'Санитария' },
  clients: { slug: 'klienty', title: 'Клиенты' },
  bank: { slug: 'bank', title: 'Банк' },
  inspections: { slug: 'proverki', title: 'Проверки' },
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function firstSentence(text) {
  const m = String(text).match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}

// Правило «писать проще» (13.10.2026): номера статей и пунктов в тексте
// статьи только мешают читать — убираем скобки со ссылками на нормы, все
// источники и так перечислены в блоке «На чём основано». Карточка для ИИ
// остаётся со ссылками.
const REF_IN_PARENS = /\s?\((?:[^()]|\([^()]*\))*\)/g;
// \b в JS не видит границ кириллических слов — отсюда (?<![а-яё]).
const REF_MARKERS = /((?<![а-яё])(п|ч|ст)\. ?\d|ФЗ|КоАП|Правил(?![а-яё])|постановлени|примечани)/i;
function plain(text) {
  return String(text)
    .replace(REF_IN_PARENS, (m) => (REF_MARKERS.test(m) ? '' : m))
    .replace(/\s+([.,;:])/g, '$1');
}

function list(items, tag = 'ul', clean = true) {
  return `<${tag}>${items.map((i) => `<li>${esc(clean ? plain(i) : i)}</li>`).join('')}</${tag}>`;
}

// Источник — строка или норма из реестра knowledge-cards/norms.js
// (19.10.2026, владелец: «указывать, откуда информация, а то подумают,
// придумали сами»): со ссылкой человек открывает первоисточник сам.
function sourcesList(items) {
  return `<ul>${items
    .map(resolveSource)
    .map((s) => (s.url
      ? `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.title)}</a></li>`
      : `<li>${esc(s.title)}</li>`))
    .join('')}</ul>`;
}

function section(title, body) {
  return body ? `<section><h2>${esc(title)}</h2>${body}</section>` : '';
}

// Общее меню всех страниц сайта, кроме главной (18.10.2026, сайт вместо
// одного лендинга — docs/sait/karta-saita.md).
const MENU = [
  ['/kak-rabotaet/', 'Как это работает'],
  ['/dlya-kogo/', 'Для кого'],
  ['/spravochnik/', 'Справочник'],
  ['/instrumenty/', 'Инструменты'],
  ['/izmeneniya/', 'Что изменилось'],
  ['/#price', 'Тариф'],
];

function page({ title, description, canonical, body }) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)} — Безопасный бизнес</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${SITE}${canonical}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:type" content="article" />
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png?v=2" />
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png?v=2" />
<link rel="stylesheet" href="/fonts/manrope.css">
<link rel="stylesheet" href="/spravochnik/spravochnik.css">
</head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="/"><picture><source srcset="/brand/mark-on-dark.svg" media="(prefers-color-scheme: dark)"><img src="/brand/mark-on-light.svg" alt="" width="22" height="26"></picture>Безопасный бизнес</a>
  <a class="top-cta" href="/lk/audit">Бесплатный тест</a>
</div>
<nav class="menu"><div class="wrap">${MENU.map(([href, label]) => `<a href="${href}"${canonical === href ? ' aria-current="page"' : ''}>${label}</a>`).join('')}<a href="/lk/login">Войти</a></div></nav>
</header>
<main class="wrap">
${body}
</main>
<footer><div class="wrap">
  <p>«Безопасный бизнес» — порядок в документах и сроках для владельцев малого сервисного бизнеса. Справочник — общая информация, а не юридическая консультация: ответ для вашего случая зависит от деталей.</p>
  <p><a href="/">Главная</a> · ${MENU.map(([href, label]) => `<a href="${href}">${label}</a>`).join(' · ')} · <a href="/lk/legal/privacy_policy">Политика конфиденциальности</a> · <a href="/cookies.html">Cookie</a></p>
  <span class="bb-integrity" aria-hidden="true">Материалы «Безопасный бизнес» (business-safe.ru) — оригинальный контент; дословное копирование без указания источника нарушает авторские права правообладателя. Метка целостности: bb-c71fb877af.</span>
</div></footer>
<script src="/cookie-notice.js" defer></script>
</body>
</html>
`;
}

function articlePage(card) {
  const topic = TOPICS[card.topic];
  const url = `/spravochnik/${topic.slug}/${card.slug}/`;
  const reminder = card.hasDeadline
    ? `<a class="cta-secondary" href="/lk/login?mode=register">Внести дату и получить напоминание заранее</a>`
    : '';
  const body = `
<nav class="crumbs"><a href="/spravochnik/">Справочник</a> › <a href="/spravochnik/${topic.slug}/">${esc(topic.title)}</a></nav>
<article>
  <h1>${esc(card.question)}</h1>
  <div class="short"><b>Коротко.</b> ${esc(plain(card.answer))}</div>
  ${section('От чего зависит', card.dependsOn && card.dependsOn.length ? list(card.dependsOn) : '')}
  ${section('Что сделать', card.steps && card.steps.length ? list(card.steps, 'ol') : '')}
  ${section('Частые ошибки', card.mistakes && card.mistakes.length ? list(card.mistakes) : '')}
  ${section('Чем грозит', card.consequences ? `<p>${esc(plain(card.consequences))}</p>` : '')}
  <aside class="cta">
    <p><b>Что из этого касается именно вас?</b> Бесплатный тест по вашей нише покажет, что уже в порядке, а что нет, без регистрации.</p>
    <a class="cta-primary" href="/lk/audit">Пройти бесплатный тест</a>
    ${reminder}
  </aside>
  <section class="sources">
    <h2>На чём основано</h2>
    ${sourcesList(card.sources || [])}
    ${card.unverified && card.unverified.length ? `<h3>Что мы пока не проверили</h3>${list(card.unverified, 'ul', false)}` : ''}
    <p class="checked">Проверено по первоисточникам ${esc(formatDate(card.checkedAt))}.</p>
  </section>
</article>`;
  return { url, html: page({ title: card.question, description: firstSentence(card.answer), canonical: url, body }) };
}

function topicPage(topicKey, cards) {
  const topic = TOPICS[topicKey];
  const url = `/spravochnik/${topic.slug}/`;
  const body = `
<nav class="crumbs"><a href="/spravochnik/">Справочник</a></nav>
<h1>${esc(topic.title)}</h1>
<ul class="cards">${cards
    .map((c) => `<li><a href="/spravochnik/${topic.slug}/${c.slug}/"><b>${esc(c.question)}</b><span>${esc(firstSentence(c.answer))}</span></a></li>`)
    .join('')}</ul>`;
  return { url, html: page({ title: topic.title, description: `${topic.title}: короткие ответы для владельцев салонов, студий и малого бизнеса.`, canonical: url, body }) };
}

// Страница ниши «Что проверяют у …» (Д5). Правило Д3 (besplatno-platno.md):
// одна пилотная ниша — маникюр; на сайте только названия пунктов теста, без
// описаний нарушений, штрафов и решений — это остаётся в тесте. Пункт ведёт
// на статью, если в карточке есть его код в related.
const NICHE_PAGES = [
  { niche: 'manicure', slug: 'manikyur', title: 'Что проверяют у салона или студии маникюра и педикюра' },
];

// Подписи блоков — как в отчёте (security/report/build.js) и в тесте.
// Блок 8 у маникюра — информированное согласие; своей подписи в отчёте нет.
const BLOCKS = [
  { block: 1, label: 'Документы и статус' },
  { block: 2, label: 'Санитария' },
  { block: 3, label: 'Оборудование и материалы' },
  { block: 4, label: 'Сотрудники', note: 'если есть мастера в штате или по договору' },
  { block: 5, label: 'Данные и документы клиентов' },
  { block: 8, label: 'Согласие клиента на процедуру' },
  { block: 6, label: 'Помещение и пожарная безопасность' },
  { block: 7, label: 'Дополнительно' },
  { block: 9, label: 'Банк и деньги на счёте', note: 'это не проверка, а то, на что смотрит банк' },
];

// В тесте название пункта часто звучит как нарушение («Отсутствует
// рециркулятор») — так оно и показывается в отчёте. На открытой странице это
// читается как обвинение, поэтому здесь — нейтральное «что смотрят».
const PUBLIC_TITLES = {
  'MN-101-доп': 'Если принимаете клиентов в квартире',
  'MN-103': 'Оплата картой',
  'MN-104': '«Уголок потребителя»',
  'MN-206-доп': 'Рециркулятор воздуха',
  'MN-502': 'Как оформлены мастера',
  'MN-505': 'Отчёты в Социальный фонд о приёме и увольнении',
  'MN-301': 'Сертификаты на оборудование (ЕАС)',
  'MN-401': 'Уведомление в Роскомнадзор об обработке данных клиентов',
  'MN-403': 'Согласие клиентов на обработку персональных данных',
  'MN-601': 'Договор на вывоз мусора',
  'MN-404':'Фото и видео клиентов в соцсетях',
  'MN-405': 'Документ на услугу для клиента (договор или квитанция)',
  'MN-406': 'Рассылки клиентам об акциях',
  'MN-604': 'Журнал огнетушителей',
  'MN-605': 'Проверка и перезарядка огнетушителей',
  'MN-607': 'Вывеска',
  'MN-608': 'Документы на отделку: пожарная безопасность материалов',
  'MN-215': 'Сколько наборов инструмента на рабочее место',
  'MN-216': 'Запас дезсредств и подписи на ёмкостях с растворами',
  'MN-217': 'Обработка после каждого клиента: салфетки, ванночки, подушка',
  'MN-218': 'Чистое бельё и его хранение',
  'MN-219': 'Маркировка уборочного инвентаря',
  'MN-220': 'Освещение рабочего места',
  'MN-221': 'Обследование вентиляции',
  'MN-701': 'Музыка в зале',
  'MN-702': 'Название и товарный знак',
  'MN-703': 'Договоры с подрядчиками',
  'MN-901': 'Переводы на карты физлиц',
  'MN-902': 'Снятие наличных',
  'MN-903': 'Проверка новых контрагентов',
  'MN-904': 'Остаток на счёте и как быстро уходят деньги',
};

async function nichePage({ niche, slug, title }, cards) {
  const url = `/proverki/${slug}/`;
  const violations = await securityContent.getViolationMatrix(niche);
  const { GUIDES } = await securityContent.getInspectionGuides();
  // Ссылка только по первому коду в related: он и есть пункт, на который
  // отвечает статья; остальные коды — «связано», статья на них не отвечает.
  const articleByCode = {};
  for (const c of cards) {
    const code = (c.related || [])[0];
    if (code) articleByCode[code] ||= `/spravochnik/${TOPICS[c.topic].slug}/${c.slug}/`;
  }
  const item = (v) => {
    const href = articleByCode[v.code];
    const label = PUBLIC_TITLES[v.code] || v.title;
    return `<li>${href ? `<a href="${href}">${esc(label)}</a>` : esc(label)}</li>`;
  };
  const known = new Set(BLOCKS.map((b) => b.block));
  const unknown = violations.filter((v) => !known.has(v.block));
  if (unknown.length) throw new Error(`Ниша ${niche}: нет подписи для блоков ${[...new Set(unknown.map((v) => v.block))].join(', ')}`);
  const blocks = BLOCKS.map((b) => ({ ...b, items: violations.filter((v) => v.block === b.block) })).filter((b) => b.items.length);
  const body = `
<nav class="crumbs"><a href="/spravochnik/">Справочник</a></nav>
<h1>${esc(title)}</h1>
<p class="lead">Это список того, на что смотрят при проверке салона или студии маникюра. Ваш набор зависит от того, есть ли у вас сотрудники, делаете ли педикюр и где принимаете клиентов, поэтому что-то из списка может вас не касаться. Что из этого нужно именно вам и что уже в порядке, покажет бесплатный тест.</p>
<section><h2>Кто может прийти</h2>
<ul class="authorities">${GUIDES.map((g) => `<li><b>${esc(g.authority)}</b><span>${esc(g.whatTheyCheck)}</span></li>`).join('')}</ul>
</section>
${blocks
    .map((b) => `<section><h2>${esc(b.label)}</h2>${b.note ? `<p class="note">${esc(b.note)}</p>` : ''}<ul>${b.items.map(item).join('')}</ul></section>`)
    .join('\n')}
<aside class="cta">
  <p><b>Что из этого касается вас?</b> Бесплатный тест покажет, что уже в порядке, а что стоит оформить. Без регистрации.</p>
  <a class="cta-primary" href="/lk/audit">Пройти бесплатный тест</a>
</aside>
<p class="checked">Список собран из пунктов нашего теста для этой ниши. Это общая информация, а не юридическая консультация.</p>`;
  return { url, html: page({ title, description: `${title}: кто может прийти и на что смотрят. Короткий список без запугивания.`, canonical: url, body }) };
}

// ---------- Страницы сайта (18.10.2026) ----------
// Правила docs/sait/besplatno-platno.md: ниши не расписываем (только
// названия), шаблоны не выкладываем, никаких обещаний результата.

const CTA_TEST = `<aside class="cta">
  <p><b>Начните с теста.</b> Около 10 минут, без регистрации. В конце — что уже в порядке и чего не хватает.</p>
  <a class="cta-primary" href="/lk/audit">Пройти бесплатный тест</a>
</aside>`;

// Экраны — настоящее приложение на примерных данных (выдуманная студия).
const HOW_STEPS = [
  {
    img: 'viol', alt: 'Список нарушений после теста',
    title: 'Пройдите тест по своей нише',
    text: 'Вопросы про документы, санитарию, сотрудников, помещение и данные клиентов — только то, что относится к вашей сфере. В конце — индекс, что уже в порядке и чего не хватает, с риском и тем, что сделать.',
  },
  {
    img: 'mydl', alt: 'Экран «Мои сроки»',
    title: 'Впишите даты своих документов',
    text: 'Огнетушитель, вывоз отходов, электронная подпись, аренда — то, что у вас есть. Всё по желанию: не знаете дату — оставьте пустым. Дату можно взять с фото документа.',
  },
  {
    img: 'home', alt: 'Главный экран со списком дел',
    title: 'Главный экран показывает, что сделать',
    text: 'Сверху — то, что уже просрочено или нужно сейчас, ниже — что подходит в ближайший месяц. Напоминаем заранее, а не в последний день.',
  },
  {
    img: 'sheet', alt: 'Карточка срока с кнопками «Готово» и «Напомнить позже»',
    title: 'Отметьте сделанное или отложите',
    text: 'Сделали — «Готово». Не сейчас — «Напомнить позже»: дата срока не сдвигается, просто напомним снова через выбранное время.',
  },
];

function howPage() {
  const url = '/kak-rabotaet/';
  const body = `
<h1>Как это работает</h1>
<p class="lead">«Безопасный бизнес» — приложение для владельца салона, студии или сервиса. Оно помогает не пропустить сроки по документам, санитарии и проверкам и всегда знать, что нужно оформить. Это не CRM для записи клиентов.</p>
<ol class="steps">${HOW_STEPS.map((s) => `
  <li>
    <div class="step-text"><h2>${esc(s.title)}</h2><p>${esc(s.text)}</p></div>
    <figure class="phone"><img src="/kak-rabotaet/${s.img}.webp" alt="${esc(s.alt)}" width="430" height="860" loading="lazy"></figure>
  </li>`).join('')}
</ol>
<section><h2>Что ещё есть в приложении</h2>
<ul>
  <li><b>Разбор бумаги от проверяющего.</b> Загрузите предписание или акт — покажем простыми словами, что там написано.</li>
  <li><b>Проверка месяца.</b> Раз в месяц 5–7 коротких вопросов по вашим же данным — что стало лучше, что горит, план на месяц.</li>
  <li><b>ИИ-советник.</b> Отвечает простыми словами на вопросы о требованиях в вашей нише.</li>
  <li><b>Сотрудники.</b> Что оформить при найме: шаги по типу договора и сроки сами попадают в список.</li>
</ul></section>
<p class="checked">Экраны — настоящее приложение на примерных данных выдуманной студии. Это общая информация, а не юридическая консультация.</p>
${CTA_TEST}`;
  return { url, html: page({ title: 'Как это работает', description: 'Тест по вашей нише, даты документов, напоминания заранее и список дел на главном экране. Как устроен «Безопасный бизнес».', canonical: url, body }) };
}

function forWhomPage() {
  const url = '/dlya-kogo/';
  const { SEGMENTS } = require('../modules/security/content/segments');
  const groups = SEGMENTS
    .map((s) => ({ title: s.label, niches: s.niches.filter((n) => n.paidAudit).map((n) => n.label) }))
    .filter((g) => g.niches.length && !/^Общие требования/.test(g.niches[0]));
  const body = `
<h1>Для кого сервис</h1>
<p class="lead">Для владельцев салонов, студий и сервисного бизнеса, которые ведут дела сами, часто без бухгалтера и юриста. Тест есть для каждой сферы ниже — вопросы в нём свои для каждой ниши.</p>
${groups.map((g) => `<section><h2>${esc(g.title)}</h2><ul class="chips">${g.niches.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>`).join('\n')}
<section><h2>Не нашли свою сферу</h2><p>Для розницы и любого другого малого бизнеса есть общий тест — без отраслевой специфики: регистрация, касса, сотрудники, помещение, данные клиентов.</p></section>
<section><h2>Что проверяют у салона маникюра</h2><p>Пример того, на что смотрят при проверке, — <a href="/proverki/manikyur/">список для маникюра и педикюра</a>.</p></section>
${CTA_TEST}`;
  return { url, html: page({ title: 'Для кого сервис', description: 'Красота, фитнес, клининг, бытовые услуги, услуги для животных и автомобилей, общепит — для кого есть тест и напоминания о сроках.', canonical: url, body }) };
}

const TOOLS = [
  { href: '/lk/audit', title: 'Тест по вашей нише', price: 'Бесплатно, без регистрации', text: 'Около 10 минут. Индекс, что уже в порядке и чего не хватает.' },
  { href: '/lk/notice-audit', title: 'Разбор бумаги от проверяющего', price: 'Бесплатно, без регистрации', text: 'Загрузите предписание или акт — объясним простыми словами, что там написано.' },
  { href: '/dokumenty/', title: 'Документы студии', price: `${require('../core/addons').getAddon('document_templates').priceRub.toLocaleString('ru-RU')} ₽ разово`, text: 'Политика конфиденциальности, согласия клиентов и договор-оферта — с данными вашей студии.' },
  { href: '/proverit-sait.html', title: 'Проверка сайта на риски по персональным данным', price: '490 ₽ разово', text: 'Политика конфиденциальности, согласия, формы на сайте — что стоит поправить.' },
  { href: '/start.html', title: 'План открытия бизнеса', price: '1490 ₽ разово', text: 'Для тех, кто только открывается: что оформить и в каком порядке.' },
];

function toolsPage() {
  const url = '/instrumenty/';
  const body = `
<h1>Инструменты</h1>
<p class="lead">Можно пользоваться без подписки. Бесплатное — бесплатно всегда, а разовые проверки оплачиваются один раз, без автосписаний.</p>
<ul class="cards">${TOOLS.map((t) => `<li><a href="${t.href}"><b>${esc(t.title)}</b><em>${esc(t.price)}</em><span>${esc(t.text)}</span></a></li>`).join('')}</ul>
<section><h2>Подписка</h2><p>Подписка — за то, что происходит после теста: даты документов, напоминания заранее, список дел, проверка месяца. <a href="/#price">Что входит и сколько стоит</a>.</p></section>`;
  return { url, html: page({ title: 'Инструменты', description: 'Бесплатный тест по нише, разбор предписания от проверяющего, проверка сайта и план открытия бизнеса.', canonical: url, body }) };
}

// «Документы студии» (21.10.2026, план 20.10): только названия документов,
// тексты не выкладываем (besplatno-platno.md). Цена — из каталога надстроек.
const DOC_GROUPS = [
  {
    title: 'Для сайта и записи клиентов',
    items: ['Политика в отношении обработки персональных данных', 'Согласие на обработку персональных данных на сайте', 'Согласие на получение рекламной и информационной рассылки'],
  },
  {
    title: 'Данные и фото клиентов',
    items: ['Согласие на обработку персональных данных — бумажное, для записи вручную', 'Согласие на распространение персональных данных', 'Согласие на использование изображения — фото и видео работ с клиентом'],
  },
  {
    title: 'Договор с клиентом',
    items: ['Публичная оферта на услуги вашей ниши', 'Оферта на продажу товаров — если продаёте через сайт', 'Оферта на онлайн-консультации — если проводите платные консультации'],
  },
];

function documentsPage() {
  const url = '/dokumenty/';
  const { getAddon } = require('../core/addons');
  const price = getAddon('document_templates').priceRub.toLocaleString('ru-RU');
  const body = `
<h1>Документы студии</h1>
<p class="lead">Документы, которые нужны салону, студии или сервису для работы с клиентами и их данными. Вы один раз заполняете анкету — название, ИНН, адрес, что есть на сайте, — и документы собираются уже с вашими данными.</p>
${DOC_GROUPS.map((g) => `<section><h2>${esc(g.title)}</h2>${list(g.items, 'ul', false)}</section>`).join('\n')}
<section><h2>Кто составлял</h2>
<p>Документы по персональным данным — по шаблонам юриста, во всех нишах. Договор с клиентом для студий красоты тоже составил юрист. Для других ниш договор пока либо адаптирован нами из шаблона юриста, либо наш черновик — у каждого документа в кабинете так и написано.</p></section>
<section><h2>Сколько стоит</h2>
<p>${price} ₽ один раз, без подписки и автосписаний. Если вы ещё не платили за подписку — к покупке месяц подписки в подарок: напоминания о сроках заранее и план по вашему тесту.</p>
<p>Купить можно сразу после бесплатного теста — там видно, каких документов у вас не хватает, — или в кабинете: «Безопасность» → «Обзор» → «Шаблоны документов».</p></section>
<aside class="cta">
  <p><b>Сначала посмотрите, чего не хватает.</b> Бесплатный тест по вашей нише покажет, какие документы уже есть, а какие стоит оформить. Без регистрации.</p>
  <a class="cta-primary" href="/lk/audit">Пройти бесплатный тест</a>
  <a class="cta-secondary" href="/lk/login">Войти в кабинет</a>
</aside>
<p class="checked">Это общая информация, а не юридическая консультация. Если ситуация нестандартная, документ стоит показать юристу.</p>`;
  return { url, html: page({ title: 'Документы студии', description: `Политика конфиденциальности, согласия клиентов и договор-оферта с данными вашей студии. ${price} ₽ разово.`, canonical: url, body }) };
}

// Лента «Что изменилось в законах» (19.10.2026) — из knowledge-cards/changes.js.
// Каждая запись ведёт на статьи, которых изменение касается.
function changesPage(cards) {
  const url = '/izmeneniya/';
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const entry = (e) => {
    const links = (e.cards || []).map((id) => byId[id]).filter(Boolean)
      .map((c) => `<li><a href="/spravochnik/${TOPICS[c.topic].slug}/${c.slug}/">${esc(c.question)}</a></li>`).join('');
    return `<article class="change">
  <p class="change-date">${esc(formatDate(e.date))}</p>
  <h2>${esc(e.title)}</h2>
  <p>${esc(e.text)}</p>
  ${links ? `<p class="note">Статьи по теме:</p><ul>${links}</ul>` : ''}
  <div class="sources"><p class="note">Источник:</p>${sourcesList(e.sources || [])}</div>
</article>`;
  };
  const upcoming = changes.upcoming || [];
  const body = `
<h1>Что изменилось в законах</h1>
<p class="lead">Изменения, которые касаются салонов, студий и малого сервисного бизнеса. Каждая запись сверена с текстом документа и ведёт на статьи справочника, которые мы после неё обновили.</p>
${upcoming.length ? `<section><h2>Скоро</h2>${upcoming.map(entry).join('\n')}</section>` : ''}
<section>${changes.map(entry).join('\n')}</section>
<p class="checked">Это общая информация, а не юридическая консультация.</p>
${CTA_TEST}`;
  return { url, html: page({ title: 'Что изменилось в законах', description: 'Новые санитарные правила, проверочные листы, патент, штрафы — что изменилось для студий и малого бизнеса, со ссылками на документы.', canonical: url, body }) };
}

function indexPage(byTopic) {
  const url = '/spravochnik/';
  const body = `
<h1>Справочник владельца</h1>
<p class="lead">Короткие честные ответы на вопросы, которые задают владельцы салонов и студий: касса, вывеска, сотрудники, документы. Каждый ответ — с указанием, от чего он зависит и на чём основан.</p>
<section><h2>Что проверяют у вас</h2><ul class="cards">${NICHE_PAGES
    .map((n) => `<li><a href="/proverki/${n.slug}/"><b>${esc(n.title)}</b><span>Кто может прийти и на что смотрят.</span></a></li>`)
    .join('')}</ul></section>
${Object.entries(byTopic)
    .map(([key, cards]) => `<section><h2><a href="/spravochnik/${TOPICS[key].slug}/">${esc(TOPICS[key].title)}</a></h2><ul class="cards">${cards
      .map((c) => `<li><a href="/spravochnik/${TOPICS[key].slug}/${c.slug}/"><b>${esc(c.question)}</b></a></li>`)
      .join('')}</ul></section>`)
    .join('\n')}`;
  return { url, html: page({ title: 'Справочник владельца', description: 'Короткие честные ответы для владельцев студий и малого бизнеса: касса, вывеска, сотрудники, документы.', canonical: url, body }) };
}

const CSS = `:root{--bg:#fff;--surface:#f5f7fa;--border:#e3e7ee;--text:#0b1220;--muted:#5b6577;--faint:#8b94a5;--accent:#2563eb;--accent-soft:#e8f0fe;--radius:16px}
@media (prefers-color-scheme:dark){:root{--bg:#0a1020;--surface:#111a2e;--border:#22304b;--text:#f1f4fa;--muted:#98a4bb;--faint:#6c7893;--accent:#5b8def;--accent-soft:#14264a}}
*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;background:var(--bg);color:var(--text);font-family:Manrope,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:17px;line-height:1.6}
.wrap{max-width:760px;margin:0 auto;padding:0 16px}a{color:var(--accent)}
.top{border-bottom:1px solid var(--border)}.top .wrap{display:flex;justify-content:space-between;align-items:center;height:60px}
.brand{display:flex;gap:8px;align-items:center;font-weight:700;color:var(--text);text-decoration:none}
.top-cta{font-size:15px;font-weight:600;text-decoration:none}
.crumbs{margin:24px 0 8px;font-size:14px;color:var(--muted)}.crumbs a{color:var(--muted)}
h1{font-size:30px;line-height:1.25;margin:8px 0 20px}h2{font-size:21px;margin:32px 0 10px}h3{font-size:17px;margin:20px 0 8px}
.lead{color:var(--muted)}
.short{background:var(--accent-soft);border-radius:var(--radius);padding:18px 20px}
ul,ol{padding-left:22px}li{margin:6px 0}
.cta{margin:36px 0;padding:22px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)}
.cta p{margin:0 0 14px}.cta-primary{display:inline-block;background:var(--accent);color:#fff;padding:12px 20px;border-radius:12px;font-weight:700;text-decoration:none}
.cta-secondary{display:inline-block;margin:12px 0 0 0;font-weight:600}
@media (min-width:560px){.cta-secondary{margin-left:16px}}
.sources{font-size:15px;color:var(--muted)}.sources h2{color:var(--text)}.checked{color:var(--faint)}
.cards{list-style:none;padding:0}.cards li{margin:10px 0}
.cards a{display:block;padding:14px 16px;border:1px solid var(--border);border-radius:12px;text-decoration:none;color:var(--text)}
.cards a span{display:block;color:var(--muted);font-size:15px;margin-top:4px}
.authorities{list-style:none;padding:0}.authorities li{margin:12px 0}.authorities span{display:block;color:var(--muted);font-size:15px}
.note{margin:-4px 0 8px;color:var(--muted);font-size:15px}
footer{margin-top:56px;border-top:1px solid var(--border);font-size:14px;color:var(--muted)}footer .wrap{padding-top:16px;padding-bottom:32px}footer a{color:var(--muted)}
.bb-integrity{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.menu{border-top:1px solid var(--border)}.menu .wrap{display:flex;gap:18px;overflow-x:auto;white-space:nowrap;height:44px;align-items:center;scrollbar-width:none}
.menu .wrap::-webkit-scrollbar{display:none}.menu a{color:var(--muted);text-decoration:none;font-size:15px;font-weight:600}.menu a[aria-current]{color:var(--text)}
.steps{list-style:none;padding:0;counter-reset:s;margin:28px 0}
.steps li{counter-increment:s;display:grid;grid-template-columns:1fr;gap:16px;margin:0 0 40px;align-items:center}
@media (min-width:700px){.steps li{grid-template-columns:1fr 260px;gap:32px}}
.step-text h2{margin-top:0}.step-text h2::before{content:counter(s);display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--text);color:var(--bg);font-size:15px;margin-right:10px;vertical-align:2px}
.phone{margin:0;justify-self:center;max-width:260px;border-radius:28px;overflow:hidden;box-shadow:0 0 0 1px var(--border),0 18px 40px -18px rgba(11,18,32,.45)}
.phone img{display:block;width:100%;height:auto}
.chips{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px}.chips li{margin:0;padding:7px 12px;border:1px solid var(--border);border-radius:999px;font-size:15px;background:var(--surface)}
.cards a em{display:block;font-style:normal;font-size:14px;font-weight:700;color:var(--accent);margin-top:2px}
.change{padding:4px 0 8px;border-bottom:1px solid var(--border)}.change h2{margin-top:6px}
.change-date{margin:20px 0 0;font-size:14px;font-weight:700;color:var(--accent)}
@media (max-width:480px){h1{font-size:25px}body{font-size:16px}}
`;

// Страница «не найдено» (19.10.2026): nginx отдаёт её с кодом 404 на любой
// несуществующий адрес (deploy/nginx.conf). В карту сайта не входит.
function notFoundPage() {
  const body = `
<h1>Такой страницы нет</h1>
<p class="lead">Возможно, адрес набран с ошибкой или страница переехала.</p>
<ul class="cards">
  <li><a href="/"><b>Главная</b><span>Что такое «Безопасный бизнес».</span></a></li>
  <li><a href="/lk/audit"><b>Бесплатный тест</b><span>Около 10 минут, без регистрации.</span></a></li>
  <li><a href="/spravochnik/"><b>Справочник</b><span>Короткие ответы со ссылками на документы.</span></a></li>
</ul>`;
  return { url: '/404.html', html: page({ title: 'Страница не найдена', description: 'Такой страницы нет на сайте «Безопасный бизнес».', canonical: '/404.html', body }).replace('<meta charset="utf-8" />', '<meta charset="utf-8" />\n<meta name="robots" content="noindex" />') };
}

// Карта сайта для Яндекса и Google (19.10.2026, план docs/plan-2026-10-19.md).
// Только открытые страницы: франшиза скрыта от поиска, результаты и «спасибо»
// не нужны. У статьи lastmod — дата сверки карточки, чтобы поисковик видел
// обновление после правки нормы.
const STATIC_PAGES = ['/', '/start.html', '/proverit-sait.html'];

function sitemap(pages, cards) {
  const lastmodByUrl = {};
  for (const c of cards) lastmodByUrl[`/spravochnik/${TOPICS[c.topic].slug}/${c.slug}/`] = c.checkedAt;
  const urls = [...STATIC_PAGES, ...pages.map((p) => p.url)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc>${lastmodByUrl[u] ? `<lastmod>${lastmodByUrl[u]}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
}

async function main() {
  const cards = await cardsRepository.getCardsForAi(null);
  const byTopic = {};
  for (const c of cards) {
    if (!TOPICS[c.topic] || !c.slug) throw new Error(`Карточка ${c.id}: нет темы или slug`);
    (byTopic[c.topic] ||= []).push(c);
  }
  // Пересобираем папку целиком — удалённая карточка не должна остаться на сайте.
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.rmSync(NICHE_OUT_DIR, { recursive: true, force: true });
  const pages = [indexPage(byTopic)];
  for (const [key, list] of Object.entries(byTopic)) {
    pages.push(topicPage(key, list));
    for (const c of list) pages.push(articlePage(c));
  }
  for (const n of NICHE_PAGES) pages.push(await nichePage(n, cards));
  pages.push(howPage(), forWhomPage(), toolsPage(), documentsPage(), changesPage(cards));
  for (const p of pages) {
    const dir = path.join(LANDING_DIR, p.url);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), p.html);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'spravochnik.css'), CSS);
  fs.writeFileSync(path.join(LANDING_DIR, 'sitemap.xml'), sitemap(pages, cards));
  fs.writeFileSync(path.join(LANDING_DIR, '404.html'), notFoundPage().html);
  console.log(`Справочник и страницы ниш: ${pages.length} страниц → ${OUT_DIR}, ${NICHE_OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
