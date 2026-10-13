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

const OUT_DIR = path.join(__dirname, '../../../landing/spravochnik');
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

function section(title, body) {
  return body ? `<section><h2>${esc(title)}</h2>${body}</section>` : '';
}

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
</div></header>
<main class="wrap">
${body}
</main>
<footer><div class="wrap">
  <p>«Безопасный бизнес» — порядок в документах и сроках для владельцев малого сервисного бизнеса. Справочник — общая информация, а не юридическая консультация: ответ для вашего случая зависит от деталей.</p>
  <p><a href="/">Главная</a> · <a href="/spravochnik/">Справочник</a> · <a href="/lk/legal/privacy_policy">Политика конфиденциальности</a> · <a href="/cookies.html">Cookie</a></p>
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
    ${list(card.sources || [], 'ul', false)}
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
  return { url, html: page({ title: topic.title, description: `${topic.title}: короткие ответы для владельцев студий и малого бизнеса.`, canonical: url, body }) };
}

function indexPage(byTopic) {
  const url = '/spravochnik/';
  const body = `
<h1>Справочник владельца</h1>
<p class="lead">Короткие честные ответы на вопросы, которые задают владельцы студий: касса, вывеска, сотрудники, документы. Каждый ответ — с указанием, от чего он зависит и на чём основан.</p>
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
footer{margin-top:56px;border-top:1px solid var(--border);font-size:14px;color:var(--muted)}footer .wrap{padding-top:16px;padding-bottom:32px}footer a{color:var(--muted)}
.bb-integrity{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
@media (max-width:480px){h1{font-size:25px}body{font-size:16px}}
`;

async function main() {
  const cards = await cardsRepository.getCardsForAi(null);
  const byTopic = {};
  for (const c of cards) {
    if (!TOPICS[c.topic] || !c.slug) throw new Error(`Карточка ${c.id}: нет темы или slug`);
    (byTopic[c.topic] ||= []).push(c);
  }
  // Пересобираем папку целиком — удалённая карточка не должна остаться на сайте.
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  const pages = [indexPage(byTopic)];
  for (const [key, list] of Object.entries(byTopic)) {
    pages.push(topicPage(key, list));
    for (const c of list) pages.push(articlePage(c));
  }
  for (const p of pages) {
    const dir = path.join(OUT_DIR, p.url.replace(/^\/spravochnik\/?/, ''));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), p.html);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'spravochnik.css'), CSS);
  console.log(`Справочник: ${pages.length} страниц → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
