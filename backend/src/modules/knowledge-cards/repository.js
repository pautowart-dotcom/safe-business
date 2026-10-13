// Карточки знаний «вопрос владельца → ответ» (план docs/plan-etap-2-znaniya.md,
// блок А). Это не модуль с роутами, а общий контент: из карточек отвечает
// ИИ-ассистент (ai-assistant/knowledge.js), дальше — сайт, тест, «Центр
// действий». Формат и правила — docs/knowledge/format-kartochki.md.
//
// Решение А2 (13.10.2026): карточки хранятся файлами в репозитории, весь код
// берёт их только через функции ниже — так же, как контент теста через
// security/content/repository.js. Если понадобится правка без деплоя, здесь
// функции меняются на запрос к таблице, остальной код не трогаем.

const CARDS = [
  require('./cards/kadry-001-medknizhka'),
  require('./cards/pomeshchenie-001-vyveska'),
  require('./cards/kassa-001-chek-korrekcii'),
  require('./cards/registraciya-001-okved'),
];

// Статусы, с которыми карточку можно отдавать ИИ как проверенный ответ.
// draft и outdated ИИ не цитирует — по ним он честно говорит, что
// проверенного ответа нет (правило «в» в systemPrompt.js).
const AI_READY_STATUSES = new Set(['source_checked', 'lawyer_checked']);

// niches: null — карточка для всех ниш; иначе — массив ключей ниш.
function cardFitsNiches(card, niches) {
  if (!card.niches) return true;
  return (niches || []).some((n) => card.niches.includes(n));
}

async function getCardsForAi(niches) {
  return CARDS.filter((c) => AI_READY_STATUSES.has(c.status) && cardFitsNiches(c, niches));
}

async function getCard(id) {
  return CARDS.find((c) => c.id === id) || null;
}

module.exports = { getCardsForAi, getCard, AI_READY_STATUSES };
