const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const { moscowDateStr } = require('../../utils/moscowDate');
const { computeDiscountRepeatComparison } = require('./discountAdvisor');
const yandexAssist = require('../../core/yandexAssist');

const router = express.Router();

const toDateStr = (d) => d.toISOString().slice(0, 10);

// Тот же resolvePeriod, что в margin-advisor.routes.js (продублирован по
// тому же принципу — единственное пересечение ради нескольких строк, общий
// модуль не заводили). По умолчанию — календарный месяц, не "сегодня":
// сравнение повторных визитов на одном дне бессмысленно.
function resolvePeriod(query) {
  if (query.dateFrom && query.dateTo) {
    return { from: query.dateFrom, to: query.dateTo };
  }

  const toStr = moscowDateStr();
  const [y, m, d] = toStr.split('-').map(Number);

  if (query.period === 'lastMonth') {
    const lastMonthEnd = new Date(Date.UTC(y, m - 1, 0));
    const lastMonthStart = new Date(Date.UTC(y, m - 2, 1));
    return { from: toDateStr(lastMonthStart), to: toDateStr(lastMonthEnd) };
  }

  if (query.period === 'today') {
    return { from: toStr, to: toStr };
  }

  if (query.period === 'week') {
    const weekStart = new Date(Date.UTC(y, m - 1, d - 6));
    return { from: toDateStr(weekStart), to: toStr };
  }

  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  return { from: toDateStr(monthStart), to: toStr };
}

// Промпт для YandexGPT: цифры уже посчитаны (computeDiscountRepeatComparison)
// — ИИ только формулирует текст поверх них, ничего не считает и не
// придумывает суммы сам.
async function buildAdvice({ discountSummary, repeatComparison }) {
  const { withDiscount, withoutDiscount, windowDays, minSampleSize } = repeatComparison;
  if (withDiscount.clients < minSampleSize && withoutDiscount.clients < minSampleSize) return null;

  const system =
    'Ты — финансовый советник продукта "Безопасный бизнес" для владельцев малого бизнеса (сначала студии маникюра). ' +
    'Тебе дают уже посчитанные цифры (сумма скидок за период и % клиентов, вернувшихся в течение ' +
    `${windowDays} дней — отдельно у клиентов со скидкой и без) — числа точные, не пересчитывай их и не придумывай новые. ` +
    'Задача: коротко (3-5 предложений, простым языком) объяснить владельцу, окупается ли скидка удержанием клиента или ' +
    'просто снижает чек — сравни проценты честно, если выборка маленькая, прямо скажи, что данных пока мало для уверенного ' +
    'вывода. Не приказывай отменить скидки и не обещай гарантированный результат. Тон честный и простой, без канцелярита.';
  const prompt =
    `Скидок за период дано на ${discountSummary.totalDiscountAmount}₽ (${discountSummary.discountedVisits} из ` +
    `${discountSummary.totalVisits} визитов). Из клиентов со скидкой, у которых прошло достаточно времени для оценки: ` +
    `${withDiscount.clients}, из них вернулись в течение ${windowDays} дней — ${withDiscount.returnedClients} ` +
    `(${withDiscount.repeatRate ?? '—'}%). Из клиентов без скидки: ${withoutDiscount.clients}, вернулись — ` +
    `${withoutDiscount.returnedClients} (${withoutDiscount.repeatRate ?? '—'}%).`;

  return yandexAssist.draftText({ system, prompt, maxTokens: 400 });
}

// Продолжение семьи ИИ-советников (marginAdvisor — первый, этот — второй,
// см. docs/business-ideas-backlog.md). Owner-only — та же граница, что у
// margin-advisor (раскрывает поведение клиентов по скидкам, не менее
// чувствительно, чем себестоимость услуг). Роль проверяется в
// finance/index.js при монтаже. Без биллинг-гейта осознанно, по прямому
// указанию владельца 19.08.2026 — margin-advisor уже получил requireAddon
// (18.08.2026), но вопрос платности для НОВЫХ советников ещё не решён,
// поэтому здесь гейта нет намеренно, не по забывчивости.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { from, to } = resolvePeriod(req.query);
    const companyId = req.tenant.companyId;

    const result = await computeDiscountRepeatComparison({ companyId, from, to });

    const response = {
      ...result,
      aiConfigured: yandexAssist.isAiConfigured(),
      advice: null,
    };

    if (response.aiConfigured) {
      try {
        response.advice = await buildAdvice(result);
      } catch (err) {
        response.adviceError = 'Не удалось получить текстовую рекомендацию от ИИ';
      }
    }

    res.json(response);
  })
);

module.exports = router;
