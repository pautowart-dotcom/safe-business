// "Паспорт бизнеса" — публичная (без авторизации) сторона расшаренной
// ссылки на сводку безопасности (см. modules/security/security.routes.js
// POST /share). Отдаёт только агрегаты — индекс/зону/счётчики, НИКОГДА
// конкретные нарушения/штрафы/названия документов (это внутренний
// материал владельца, не то, что видит внешний наблюдатель). Тихая
// обкатка: ссылку пока может создать только is_test-компания, но сам
// публичный GET ничего не знает про is_test — он просто не найдёт токен,
// если тот никогда не был создан.
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { computeSecurityStatus } = require('../modules/security/status');
const { SEGMENTS } = require('../modules/security/content/segments');

const router = express.Router();

function nicheLabel(key) {
  return SEGMENTS.flatMap((s) => s.niches).find((n) => n.key === key)?.label || key;
}

const ZONE_COLORS = { green: '#1a9c5c', yellow: '#b8790a', red: '#d13b3b' };
const ZONE_LABELS = { green: 'Зелёная зона', yellow: 'Жёлтая зона', red: 'Красная зона' };

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

// Бейдж — картинка для встраивания на сайт/в объявление владельца. Тон
// намеренно честный, не рекламный (CLAUDE.md: "не звучать как реклама
// чудо-решения", "не обещать гарантированный результат") — "прошёл
// проверку" + РЕАЛЬНАЯ зона (в т.ч. жёлтая/красная, если она такая), а не
// "сертифицировано"/"гарантированно безопасно". Кто не захочет показывать
// жёлтый/красный бейдж — просто не вставит его себе на сайт, ограничивать
// выдачу по зоне не стали (то же самое честное отношение, что и у
// диагностики — "остаётся честной независимо от партнёра").
function renderBadgeSvg({ zone, indexPercent }) {
  const color = ZONE_COLORS[zone] || ZONE_COLORS.yellow;
  const label = escapeXml(ZONE_LABELS[zone] || zone);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="76" viewBox="0 0 280 76" role="img" aria-label="Безопасный бизнес — ${label}, ${indexPercent}%">
  <rect width="280" height="76" rx="12" fill="#0e0e14"/>
  <circle cx="26" cy="38" r="9" fill="${color}"/>
  <text x="46" y="30" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#96969f">Прошёл проверку — Безопасный бизнес</text>
  <text x="46" y="50" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="700" fill="#ffffff">${label} · ${indexPercent}%</text>
</svg>`;
}

router.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT id, name FROM companies WHERE security_share_token = $1', [req.params.token]);
    if (rows.length === 0) return res.status(404).json({ error: 'Ссылка недействительна' });
    const company = rows[0];

    const status = await computeSecurityStatus(company.id);
    if (!status.hasProfile || status.indexPercent == null) {
      return res.json({ companyName: company.name, hasResult: false });
    }

    const resolvedCount = status.violations.filter((v) => v.status === 'resolved').length;
    res.json({
      companyName: company.name,
      hasResult: true,
      niches: status.testedNiches.map(nicheLabel),
      indexPercent: status.indexPercent,
      zone: status.zone,
      violationsCount: status.violationsCount,
      resolvedCount,
      openCount: status.violationsCount - resolvedCount,
      generatedAt: new Date().toISOString(),
    });
  })
);

// Кэш короткий (не бессрочный) — бейдж должен отражать текущее состояние,
// а не замороженный снимок на момент первой установки виджета на сайт
// владельца (индекс меняется по мере устранения нарушений/новых сроков).
router.get(
  '/:token/badge.svg',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT id FROM companies WHERE security_share_token = $1', [req.params.token]);
    if (rows.length === 0) return res.status(404).end();

    const status = await computeSecurityStatus(rows[0].id);
    if (!status.hasProfile || status.indexPercent == null) return res.status(404).end();

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(renderBadgeSvg({ zone: status.zone, indexPercent: status.indexPercent }));
  })
);

module.exports = router;
