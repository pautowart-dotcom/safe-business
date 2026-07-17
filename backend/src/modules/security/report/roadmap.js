// Дорожная карта устранения нарушений. Источник:
// docs/security-engine/12_Roadmap_FINAL.md. Бакеты считаются по полю
// "срок устранения" из Файла 10 (daysMax), как и требует §"ПРИНЦИП
// СОРТИРОВКИ" — а не по спискам-примерам из Файла 12, которые внутренне
// противоречивы (например, MN-202 срок "1 день" в Файле 10, но перечислен
// в примере блока "7 дней" в Файле 12; MN-703 наоборот). Файл 10 объявлен
// единственным источником срока/стоимости (Файл 09 §6), поэтому здесь всегда
// считаем по нему, а не копируем примеры.

function bucketFor(violation) {
  const days = violation.daysMax == null ? Infinity : violation.daysMax;
  if (days <= 1) return 'today';
  if (days <= 7) return 'week';
  if (days <= 14) return 'twoWeeks';
  return 'month';
}

function buildRoadmap(violations) {
  const buckets = { today: [], week: [], twoWeeks: [], month: [] };
  for (const v of violations) {
    buckets[bucketFor(v)].push(v);
  }

  // Быстрые победы: бесплатно и не дольше 3 дней по нижней границе (Файл 12).
  const quickWins = violations.filter((v) => v.free && v.daysMin <= 3);

  const budgetMin = violations.reduce((sum, v) => sum + (v.costMin || 0), 0);

  return { ...buckets, quickWins, budgetMin };
}

// "Прогноз результата" (Файл 12): считает, что все нарушения из блоков
// "сегодня" + "7 дней" будут устранены. Формула из ТЗ буквальная —
// score + количество устранённых нарушений (без учёта того, что часть уже
// давала 0,5 балла), это заявленное упрощение самого ТЗ, а не наша ошибка.
function buildForecast({ score, maxScore, roadmap }) {
  const fixableCount = roadmap.today.length + roadmap.week.length;
  const projectedScore = Math.min(score + fixableCount, maxScore);
  const projectedPercent = maxScore > 0 ? Math.round((projectedScore / maxScore) * 1000) / 10 : 0;

  const fixableCodes = new Set([...roadmap.today, ...roadmap.week].map((v) => v.code));
  const allViolations = [...roadmap.today, ...roadmap.week, ...roadmap.twoWeeks, ...roadmap.month];
  const criticalBefore = allViolations.filter((v) => v.risk >= 9).length;
  const criticalAfter = allViolations.filter((v) => v.risk >= 9 && !fixableCodes.has(v.code)).length;

  return { fixableCount, projectedScore, projectedPercent, criticalBefore, criticalAfter };
}

module.exports = { buildRoadmap, buildForecast };
