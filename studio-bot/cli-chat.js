// Проверка бота без Telegram: пишете как клиент — видите ответ и карточку.
//   node cli-chat.js                          — диалог в консоли
//   node cli-chat.js --batch test/voprosy.txt — прогон списка вопросов (каждый — новый диалог)
// Нужны YANDEX_GPT_API_KEY и YANDEX_FOLDER_ID в .env.
const fs = require('fs');
const readline = require('readline');
const { loadEnv } = require('./src/env');
loadEnv();
const { loadConfig, loadKb, loadStyle } = require('./src/kb');
const brain = require('./src/brain');
const yandex = require('./src/yandex');

const config = loadConfig();
const kb = loadKb();
const styleText = loadStyle();
const llm = (msgs) => yandex.complete(msgs);

function show(r) {
  console.log(`  бот: ${r.reply}`);
  if (r.attach === 'route') console.log('  + карточки «Как войти в студию»');
  if (r.handoff !== 'none') console.log(`  → карточка [${r.handoff} · ${r.topic}] ${r.summary}${r.guard ? ` (страховка: ${r.guard})` : ''}`);
  if (r.gap) console.log(`  ? не хватило в базе: ${r.gap}`);
}

// Имя клиента в Telegram для проверки обращения по имени: --name "Anna"
const ni = process.argv.indexOf('--name');
const clientName = ni > 0 ? process.argv[ni + 1] : 'Анна';

async function batch(file) {
  const questions = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  for (const q of questions) {
    console.log(`\nклиент: ${q}`);
    show(await brain.answer({ text: q, config, kbText: kb.text, styleText, clientName, llm }));
  }
}

async function interactive() {
  const history = [];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Пишите как клиент. Пустая строка — выход.');
  for await (const line of rl) {
    if (!line.trim()) break;
    const r = await brain.answer({ text: line, history, config, kbText: kb.text, styleText, clientName, llm });
    show(r);
    history.push({ role: 'user', text: line }, { role: 'assistant', text: r.reply });
  }
  rl.close();
}

if (!yandex.isAiConfigured()) console.warn('YandexGPT не настроен — все ответы будут «передал администратору».\n');
const i = process.argv.indexOf('--batch');
(i > 0 ? batch(process.argv[i + 1]) : interactive()).catch((err) => { console.error(err); process.exit(1); });
