const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const { moscowDateStr } = require('../../utils/moscowDate');
const { computeMarginByService } = require('./marginAdvisor');
const yandexAssist = require('../../core/yandexAssist');

const router = express.Router();

const toDateStr = (d) => d.toISOString().slice(0, 10);

// Тот же resolvePeriod, что в summary.routes.js (продублирован по тому же
// принципу — см. комментарий у DISCOUNT_AMOUNT_SQL там: единственное
// пересечение ради нескольких строк, общий модуль заводить не стали) — с
// ОДНИМ отличием: если period/dateFrom/dateTo вообще не переданы, здесь по
// умолчанию берётся текущий календарный месяц, а не "сегодня". Маржа/минуту
// по услуге — средняя величина, на одном дне визитов почти всегда слишком
// мало данных, чтобы что-то значило.
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

  // 'month' и default — календарный месяц с 1-го числа.
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  return { from: toDateStr(monthStart), to: toStr };
}

// Промпт для YandexGPT: цифры уже посчитаны (computeMarginByService) — ИИ
// только формулирует текст поверх них, ничего не считает и не придумывает
// суммы сам. Топ-5 худших по марже/минуту — то, что владельцу нужно увидеть
// в первую очередь, весь список и так возвращается отдельно в services.
async function buildAdvice(services) {
  const withDuration = services.filter((s) => s.marginPerMinute !== null);
  if (withDuration.length === 0) return null;

  const top = withDuration.slice(0, 5);
  const lines = top.map(
    (s, i) =>
      `${i + 1}. ${s.serviceName}${s.niche ? ` (${s.niche})` : ''}: маржа ${s.marginPerMinute}₽/мин, средний чек ${s.avgPrice}₽, длительность ${s.durationMinutes} мин, визитов за период ${s.visitsCount}, себестоимость материалов на визит ${s.avgMaterialsCost}₽, выплата мастеру на визит ${s.avgMasterPayout}₽.`
  );

  const system =
    'Ты — финансовый советник продукта "Безопасный бизнес" для владельцев малого бизнеса (сначала студии маникюра). ' +
    'Тебе дают уже посчитанные цифры маржи в минуту по услугам — числа точные, не пересчитывай их и не придумывай новые. ' +
    'Задача: коротко (3-5 предложений, простым языком) объяснить владельцу, какая услуга хуже всего использует время мастера ' +
    'и что стоит рассмотреть (пересмотреть цену, время услуги или состав расходников) — не приказывай и не обещай гарантированный ' +
    'результат. Тон честный и простой, без канцелярита и без запугивания проверками.';
  const prompt = `Услуги по марже в минуту за период, от худшей к лучшей:\n${lines.join('\n')}`;

  return yandexAssist.draftText({ system, prompt, maxTokens: 400 });
}

// Этап 6 плана аналитики (docs/plan-2026-08-15-analytics-ai-monthly-summary.md)
// — owner-only, та же граница, что у netProfit/materialsCost в
// summary.routes.js (маржа по услуге раскрывает себестоимость и % мастера,
// не менее чувствительно). Роль проверяется в finance/index.js при монтаже.
// Без биллинг-гейта осознанно — платность/доступ для "своих" компаний ещё
// не решены (см. docs/business-ideas-backlog.md, раздел "ИИ-советник по
// марже"), добавится отдельно, когда решится вопрос идентификации.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { from, to } = resolvePeriod(req.query);
    const companyId = req.tenant.companyId;

    const services = await computeMarginByService({ companyId, from, to });

    const response = {
      period: { from, to },
      services,
      aiConfigured: yandexAssist.isAiConfigured(),
      advice: null,
    };

    // ИИ-текст — необязательная надстройка поверх уже готовых и надёжных
    // цифр: если YandexGPT не настроен (нет ключа в .env) или запрос упал,
    // отдаём числа как есть, а не роняем весь эндпоинт из-за текстового
    // слоя.
    if (response.aiConfigured && services.some((s) => s.marginPerMinute !== null)) {
      try {
        response.advice = await buildAdvice(services);
      } catch (err) {
        response.adviceError = 'Не удалось получить текстовую рекомендацию от ИИ';
      }
    }

    res.json(response);
  })
);

module.exports = router;
