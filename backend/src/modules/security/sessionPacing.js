// Минимальное время прохождения теста (20.09.2026, шаг 1 защиты от массового
// копирования). Человек не прочитает 43 вопроса быстрее, чем по ~1.2 секунды
// на вопрос; скрипт, обходящий тест ради карточек нарушений, проходит его за
// секунды (реальный замер: 43 ответа за пару секунд). Не блокировка, а
// пауза: ответ на /complete просит подождать N секунд, после чего запрос
// можно повторить. Бот, конечно, может добавить sleep — цель поднять цену
// массового обхода и сделать его медленным, а не сделать невозможным.
const SECONDS_PER_QUESTION = 1.2;
const MIN_SECONDS = 20;

function minCompletionSeconds(totalQuestions) {
  return Math.max(MIN_SECONDS, Math.ceil((Number(totalQuestions) || 0) * SECONDS_PER_QUESTION));
}

// Сколько секунд ещё нужно подождать (0 — можно завершать).
function secondsLeft(startedAt, totalQuestions, now = Date.now()) {
  const elapsed = (now - new Date(startedAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(minCompletionSeconds(totalQuestions) - elapsed));
}

module.exports = { minCompletionSeconds, secondsLeft, SECONDS_PER_QUESTION, MIN_SECONDS };
