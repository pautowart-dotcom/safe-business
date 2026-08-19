const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const { computeMasterDepartureImpact } = require('./masterDepartureAdvisor');
const yandexAssist = require('../../core/yandexAssist');

const router = express.Router();

// Промпт для YandexGPT: цифры уже посчитаны (computeMasterDepartureImpact) —
// ИИ только формулирует текст поверх них. Тон — явно заданный в задаче:
// "удержание дороже, чем кажется", не "накажи мастера" — не про вину
// мастера, а про то, что уход стоит владельцу больше, чем кажется на
// первый взгляд (зарплата+найм — не вся цена).
async function buildAdvice(masters) {
  const withData = masters.filter((m) => !m.tooRecentToJudge && m.leftCount > 0);
  if (withData.length === 0) return null;

  const lines = withData.map(
    (m) =>
      `${m.masterName}: ушёл ~${m.departureDate}, из ${m.regularClientsCount} постоянных клиентов остались ${m.stayedCount}, ` +
      `ушли вместе с ним ${m.leftCount}; их выручка за год до ухода мастера — ${m.leftClientsRevenueLast12Months}₽.`
  );

  const system =
    'Ты — советник продукта "Безопасный бизнес" для владельцев малого бизнеса (сначала студии маникюра). ' +
    'Тебе дают уже посчитанные цифры о мастерах, которые уволились, и о том, сколько их постоянных клиентов ' +
    'продолжили ходить в салон, а сколько ушли вместе с мастером — числа точные, не пересчитывай их и не придумывай новые. ' +
    'Задача: коротко (3-5 предложений, простым языком) объяснить владельцу, что уход мастера часто стоит дороже, чем ' +
    'просто зарплата и найм нового человека — из-за клиентов, которые уходят вместе с ним. Тон — про удержание команды ' +
    'на будущее (стоит подумать, что удерживает мастеров), НЕ про вину конкретного мастера и не как инструмент давления ' +
    'на сотрудников. Не приказывай и не обещай гарантированный результат.';
  const prompt = `Ушедшие мастера за период наблюдения:\n${lines.join('\n')}`;

  return yandexAssist.draftText({ system, prompt, maxTokens: 400 });
}

// Продолжение семьи ИИ-советников (см. margin-advisor.routes.js,
// discount-advisor.routes.js). Owner-only — не менее чувствительно, чем
// остальные (данные о конкретных сотрудниках и клиентах). Роль проверяется
// в finance/index.js при монтаже. Без биллинг-гейта осознанно, тот же
// принцип, что и у discount-advisor — см. комментарий там.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = req.tenant.companyId;
    const masters = await computeMasterDepartureImpact({ companyId });

    const response = {
      masters,
      aiConfigured: yandexAssist.isAiConfigured(),
      advice: null,
    };

    if (response.aiConfigured && masters.some((m) => !m.tooRecentToJudge)) {
      try {
        response.advice = await buildAdvice(masters);
      } catch (err) {
        response.adviceError = 'Не удалось получить текстовую рекомендацию от ИИ';
      }
    }

    res.json(response);
  })
);

module.exports = router;
