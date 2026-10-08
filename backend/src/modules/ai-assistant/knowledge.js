// База знаний ассистента (07.10.2026). На вопрос о требованиях («нужно ли
// уведомление», «можно ли слать акции в WhatsApp», «уголок потребителя»)
// ассистент отвечал из общих знаний YandexGPT — пустое «обратитесь к юристу»
// и даже «на сайт ФНС», хотя проверенный ответ уже лежит в пунктах теста.
// Теперь перед каждым ответом сервер сам находит 2–3 подходящих пункта теста
// по нишам компании и кладёт их в контекст модели — модель только
// пересказывает их человеческим языком (правила — в systemPrompt.js).
//
// Поиск сознательно простой (совпадение основ слов), без эмбеддингов: пунктов
// на нишу ~40, работает без внешних вызовов и предсказуемо. Решение «вызвать
// ли инструмент» модели не доверяем — подбираем справку всегда, сами.
const repository = require('../security/content/repository');
const { computeSecurityStatus } = require('../security/status');
const { NICHE_LABELS } = require('../roadmap/content/buildRoadmap');
const yandexAgent = require('../../core/yandexAgent');

const STOP_WORDS = new Set([
  'нужно', 'нужен', 'нужна', 'нужны', 'можно', 'надо', 'какой', 'какие', 'какая', 'какое', 'если', 'чтобы',
  'когда', 'зачем', 'почему', 'сколько', 'этот', 'этого', 'эта', 'есть', 'меня', 'мной', 'моей', 'моих',
  'нашей', 'наших', 'вашей', 'ваших', 'студии', 'студия', 'салон', 'салона', 'бизнес', 'бизнеса', 'делать',
  'сделать', 'подать', 'подавать', 'куда', 'обязательно', 'должен', 'должна', 'должны', 'вообще', 'правда',
  'также', 'тоже', 'очень', 'только', 'клиент', 'клиентов', 'клиентам', 'работы', 'работе', 'быть', 'должно',
  'после', 'часто', 'стоит', 'мастер', 'мастеру', 'мастера', 'мастеров', 'маникюр', 'маникюра', 'педикюр', 'там',
  'что', 'как', 'его', 'мне', 'нам', 'вам', 'это', 'все', 'или', 'для', 'где', 'кто', 'чем', 'тут',
]);
// Трёхбуквенные слова отбрасываем, кроме аббревиатур из теста.
const SHORT_KEEP = new Set(['ркн', 'тко', 'ккт', 'сэз', 'ппк', 'пдн', 'эцп', 'ифнс', 'мчс', 'аренд']);

// Синонимы, которыми владельцы называют пункты иначе, чем в тесте.
const SYNONYMS = {
  'акци': ['реклам', 'рассыл'], 'скидк': ['реклам', 'рассыл'], 'спам': ['реклам', 'рассыл'],
  'whats': ['рассыл'], 'ватса': ['рассыл'], 'вотса': ['рассыл'], 'телег': ['рассыл'],
  'роском': ['ркн'], 'ркн': ['роском'],
  'огнет': ['пожар'], 'пожар': ['огнет'],
  'мусор': ['отход', 'тко'], 'отход': ['тко'],
  'сэз': ['уведом'], 'роспо': ['уведом'],
  'медкн': ['медицин', 'книжк'], 'книжк': ['медицин'],
  'касса': ['ккт', 'чек'], 'кассу': ['ккт', 'чек'], 'чеки': ['ккт'],
};

function stem(word) {
  return word.length <= 5 ? word : word.slice(0, Math.max(5, Math.ceil(word.length * 0.6)));
}

function queryStems(text) {
  const words = String(text || '').toLowerCase().replace(/ё/g, 'е').match(/[a-zа-я0-9]+/g) || [];
  const stems = new Set();
  for (const w of words) {
    if (STOP_WORDS.has(w) || (w.length <= 3 && !SHORT_KEEP.has(w))) continue;
    const s = stem(w);
    stems.add(s);
    for (const [key, extra] of Object.entries(SYNONYMS)) {
      if (s.startsWith(key) || key.startsWith(s)) extra.forEach((e) => stems.add(e));
    }
  }
  return [...stems];
}

function norm(text) {
  return String(text || '').toLowerCase().replace(/ё/g, 'е');
}

// Совпадение в названии весит больше, чем в описании и тем более в шагах.
function scoreItem(item, stems) {
  const fields = [
    [norm(item.title), 4],
    [norm(item.description), 2],
    [norm(item.solution), 1],
    [norm((item.howTo || []).join(' ')), 1],
  ];
  let score = 0;
  let matched = 0;
  for (const s of stems) {
    let best = 0;
    for (const [text, weight] of fields) {
      if (text.includes(s)) best = Math.max(best, weight);
    }
    if (best > 0) matched += 1;
    score += best;
  }
  return { score, matched };
}

function searchItems(items, question, limit = 3) {
  const stems = queryStems(question);
  if (stems.length === 0) return [];
  const ranked = (items || [])
    .map((item) => ({ item, ...scoreItem(item, stems) }))
    // Хотя бы одно совпадение в названии/описании — иначе это шум из шагов.
    .filter((r) => r.score >= 2)
    .sort((a, b) => b.score - a.score || b.matched - a.matched || (b.item.risk || 0) - (a.item.risk || 0));
  if (ranked.length === 0) return [];
  // Попутные пункты, совпавшие одним словом, только сбивают модель —
  // берём те, что набрали хотя бы половину от лучшего.
  const top = ranked[0].score;
  return ranked
    .filter((r) => r.score >= top / 2)
    .slice(0, limit)
    .map((r) => r.item);
}

function formatItem(item, statusByCode) {
  const lines = [`### ${item.title}`];
  const st = statusByCode.get(item.code);
  if (st === 'open') lines.push('Статус у этой компании по тесту: НАРУШЕНИЕ, требует внимания.');
  else if (st === 'resolved') lines.push('Статус у этой компании: отмечено как исправленное.');
  lines.push(`Что бывает не так: ${item.description}`);
  if (item.fineText) lines.push(`Ответственность: ${item.fineText}`);
  if (item.normBase) lines.push(`Основание: ${item.normBase}`);
  if (item.solution) lines.push(`Что сделать: ${item.solution}`);
  if (Array.isArray(item.howTo) && item.howTo.length > 0) {
    lines.push('Шаги:');
    item.howTo.forEach((h, i) => lines.push(`${i + 1}. ${h}`));
  }
  const cost = item.free ? 'без затрат' : item.costMin ? `от ${item.costMin} ₽` : null;
  if (cost) lines.push(`Затраты: ${cost}.`);
  return lines.join('\n');
}

// Запасной подбор (08.10.2026): владелец называет вещи своими словами
// («справка после больничного», «бумажка для мастера»), и поиск по основам
// слов промахивается мимо пункта, который в тесте есть. Тогда отдаём модели
// только пронумерованный список названий пунктов ниши и просим выбрать
// номера — отдельным коротким вызовом, без истории и инструментов. Ответ
// «0» (ничего не подходит) — нормальный исход, тогда правило «в».
async function pickByTitles(items, question) {
  if (!items.length || !yandexAgent.isAiConfigured()) return [];
  const list = items.map((item, i) => `${i + 1}. ${item.title}`).join('\n');
  const result = await yandexAgent.chat({
    messages: [
      {
        role: 'system',
        content:
          'Ты подбираешь пункты из списка требований к бизнесу под вопрос владельца. Верни через запятую номера ' +
          'не более чем 3 пунктов, которые прямо отвечают на вопрос. Если ни один пункт прямо не отвечает — верни 0. ' +
          'Только номера, без слов.',
      },
      { role: 'user', content: `Список:\n${list}\n\nВопрос: ${question}` },
    ],
    maxTokens: 20,
    temperature: 0,
  });
  if (result.type !== 'text') return [];
  const numbers = (result.text.match(/\d+/g) || []).map(Number);
  const picked = [];
  for (const n of numbers) {
    const item = items[n - 1];
    if (item && !picked.includes(item)) picked.push(item);
    if (picked.length === 3) break;
  }
  return picked;
}

// Возвращает текст справки для системного сообщения или null, если тест
// не пройден / ничего подходящего не нашлось (тогда модель по правилам
// говорит, что пункта в базе нет). previousQuestion — предыдущий вопрос
// пользователя: уточнение («а где взять форму?») само по себе ничего не
// находит, ищем ещё раз вместе с ним.
async function buildKnowledgeContext(companyId, question, previousQuestion = null) {
  const status = await computeSecurityStatus(companyId);
  const niches = (status.profile?.niches || []).filter(Boolean);
  if (niches.length === 0) return { niches: [], text: null };

  const seen = new Set();
  const items = [];
  for (const niche of niches) {
    const matrix = (await repository.getViolationMatrix(niche)) || [];
    for (const v of matrix) {
      if (seen.has(v.title)) continue;
      seen.add(v.title);
      items.push(v);
    }
  }

  const fullQuestion = previousQuestion ? `${previousQuestion} ${question}` : question;
  let found = searchItems(items, question);
  if (found.length === 0 && previousQuestion) found = searchItems(items, fullQuestion);
  if (found.length === 0) {
    try {
      found = await pickByTitles(items, fullQuestion);
    } catch (err) {
      console.error('[ai-assistant] pickByTitles failed:', err.message);
    }
  }
  const nicheNames = niches.map((n) => NICHE_LABELS[n] || n).join(', ');
  if (found.length === 0) return { niches, nicheNames, text: null };

  const statusByCode = new Map((status.violations || []).map((v) => [v.code, v.status]));
  return {
    niches,
    nicheNames,
    text: found.map((item) => formatItem(item, statusByCode)).join('\n\n'),
  };
}

module.exports = { buildKnowledgeContext, searchItems, queryStems, pickByTitles };
