const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const { moscowDateStr } = require('../../utils/moscowDate');
const { computeMarginByService } = require('./marginAdvisor');
const { computeDiscountRepeatComparison } = require('./discountAdvisor');
const { computeMasterDepartureImpact } = require('./masterDepartureAdvisor');
const yandexAssist = require('../../core/yandexAssist');

const router = express.Router();

const toDateStr = (d) => d.toISOString().slice(0, 10);

// Тот же resolvePeriod, что в margin-advisor.routes.js/discount-advisor.routes.js
// (продублирован по тому же принципу — единственное пересечение ради
// нескольких строк). Период применяется к марже и скидкам; советник по
// ушедшим мастерам периода не использует (он про всех неактивных мастеров
// сразу, см. masterDepartureAdvisor.js).
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

// Порог "стоит показать в дайджесте" — тот же принцип, что используется для
// карточки в Центре действий (dailyOperationsNudges.js): реальный убыток на
// минуту (не просто "хуже других услуг" — 0 и меньше значит компания
// реально теряет деньги на этой услуге).
function hasNotableMargin(services) {
  return services.some((s) => s.marginPerMinute !== null && s.marginPerMinute < 0);
}

// Обе группы должны быть достаточного размера (minSampleSize), иначе разница
// в процентах — просто шум на нескольких клиентах, не сигнал.
function hasNotableDiscountGap(repeatComparison) {
  const { withDiscount, withoutDiscount, minSampleSize } = repeatComparison;
  if (withDiscount.clients < minSampleSize || withoutDiscount.clients < minSampleSize) return false;
  if (withDiscount.repeatRate == null || withoutDiscount.repeatRate == null) return false;
  // 10 процентных пунктов — порог реализации ("заметная разница"), не факт
  // из данных, можно пересмотреть.
  return withoutDiscount.repeatRate - withDiscount.repeatRate >= 10;
}

function hasNotableMasterDeparture(masters) {
  return masters.some((m) => !m.tooRecentToJudge && m.leftCount > 0);
}

// Один связный текст поверх трёх советников сразу (не три раздельных куска)
// — задача явно просила единый вывод, если это технически несложно; здесь
// просто один промпт со всеми тремя блоками цифр, а не последовательные
// вызовы ИИ по одному на советника.
async function buildDigest({ marginServices, discountResult, masterDepartures }) {
  const blocks = [];

  const worstMargin = marginServices.filter((s) => s.marginPerMinute !== null).slice(0, 3);
  if (worstMargin.length > 0) {
    blocks.push(
      'Маржа по услугам (худшие по марже в минуту): ' +
        worstMargin.map((s) => `${s.serviceName} — ${s.marginPerMinute}₽/мин`).join('; ') + '.'
    );
  }

  const { withDiscount, withoutDiscount, windowDays } = discountResult.repeatComparison;
  if (withDiscount.clients > 0 || withoutDiscount.clients > 0) {
    blocks.push(
      `Возврат клиентов в течение ${windowDays} дней: со скидкой — ${withDiscount.repeatRate ?? '—'}% ` +
        `(${withDiscount.clients} клиентов), без скидки — ${withoutDiscount.repeatRate ?? '—'}% (${withoutDiscount.clients} клиентов).`
    );
  }

  const departedWithData = masterDepartures.filter((m) => !m.tooRecentToJudge);
  if (departedWithData.length > 0) {
    blocks.push(
      'Ушедшие мастера: ' +
        departedWithData
          .map((m) => `${m.masterName} — из ${m.regularClientsCount} постоянных клиентов ушли вместе с ним ${m.leftCount}`)
          .join('; ') + '.'
    );
  }

  if (blocks.length === 0) return null;

  const system =
    'Ты — ИИ-управляющий продукта "Безопасный бизнес" для владельцев малого бизнеса (сначала студии маникюра). ' +
    'Тебе дают уже посчитанные цифры из трёх разных советников (маржа по услугам, окупаемость скидок, цена ушедшего ' +
    'мастера) — числа точные, не пересчитывай их и не придумывай новые. Задача: написать ОДИН связный текст (5-8 ' +
    'предложений), который сводит все переданные блоки в общую картину "на чём бизнес теряет деньги прямо сейчас" — ' +
    'не три отдельных абзаца под копирку, а один текст с логическими переходами между темами, только по тем блокам, ' +
    'что реально переданы (если блок не передан — не упоминай эту тему вовсе). Не приказывай и не обещай гарантированный ' +
    'результат. Тон честный и простой, без канцелярита и без запугивания.';
  const prompt = blocks.join('\n');

  return yandexAssist.draftText({ system, prompt, maxTokens: 500 });
}

// Пятый шаг семьи ИИ-советников (см. margin-advisor.routes.js,
// discount-advisor.routes.js, master-departure-advisor.routes.js) — сводный
// дайджест для верхней части общего экрана "ИИ-советник" на фронте. Считает
// те же три советника заново (чистые функции, без побочных эффектов) — не
// кеширует и не переиспользует результат отдельных эндпоинтов, отдельный
// запрос предпочтён общему стейту ради простоты в этом заходе.
// Owner-only, без биллинг-гейта — тот же принцип, что у остальных двух новых
// советников (см. комментарий в discount-advisor.routes.js).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { from, to } = resolvePeriod(req.query);
    const companyId = req.tenant.companyId;

    const [marginServices, discountResult, masterDepartures] = await Promise.all([
      computeMarginByService({ companyId, from, to }),
      computeDiscountRepeatComparison({ companyId, from, to }),
      computeMasterDepartureImpact({ companyId }),
    ]);

    const response = {
      period: { from, to },
      hasNotableFindings:
        hasNotableMargin(marginServices) ||
        hasNotableDiscountGap(discountResult.repeatComparison) ||
        hasNotableMasterDeparture(masterDepartures),
      aiConfigured: yandexAssist.isAiConfigured(),
      digest: null,
    };

    if (response.aiConfigured) {
      try {
        response.digest = await buildDigest({ marginServices, discountResult, masterDepartures });
      } catch (err) {
        response.digestError = 'Не удалось получить текстовую рекомендацию от ИИ';
      }
    }

    res.json(response);
  })
);

module.exports = router;
