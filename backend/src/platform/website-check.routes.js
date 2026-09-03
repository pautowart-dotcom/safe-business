// Проверка сайта на риски 152-ФЗ (03.09.2026) — движок в
// ../modules/website-check/scan.js, использован на три точки продажи (см.
// план "Проверка сайта"): здесь общий backend-путь, которым пользуются все
// три (ЛК подписчика/гостя теста — через этот роут; отдельный лендинг —
// через тот же роут после чек-аута addons.routes.js/webhook).
//
// НЕ под modules/security (requireModule('security')) — сайт-проверка не
// привязана к конкретному модулю/нише, должна работать для любой компании
// независимо от того, какие ниши/модули у неё включены.
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const {
  requireWebsiteCheckAccess,
  findRecentSubscriptionCheck,
  WEBSITE_CHECK_SUBSCRIPTION_INTERVAL_DAYS,
} = require('../core/middleware/websiteCheck');
const { scanWebsite } = require('../modules/website-check/scan');
const { sendMail } = require('../core/mailer');

const router = express.Router();
router.use(requireAuth, requireTenant);

router.post(
  '/scan',
  requireWebsiteCheckAccess,
  asyncHandler(async (req, res) => {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!url) return res.status(400).json({ error: 'Укажите адрес сайта' });

    const recent = await findRecentSubscriptionCheck(req.tenant.companyId);
    if (recent) {
      const nextAt = new Date(recent.created_at);
      nextAt.setDate(nextAt.getDate() + WEBSITE_CHECK_SUBSCRIPTION_INTERVAL_DAYS);
      return res.status(429).json({
        error: `Бесплатная проверка сайта по подписке — раз в ${WEBSITE_CHECK_SUBSCRIPTION_INTERVAL_DAYS} дней. Следующая доступна ${nextAt.toLocaleDateString('ru-RU')}.`,
        nextAvailableAt: nextAt.toISOString(),
        requiresAddon: 'website_check',
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO website_checks (company_id, url, source, status)
       VALUES ($1, $2, 'subscription', 'pending') RETURNING id`,
      [req.tenant.companyId, url]
    );
    const checkId = rows[0].id;
    runScan(checkId, url);
    res.status(202).json({ id: checkId });
  })
);

// Для карточки в ЛК/тесте после возврата с оплаты — не обязательно знать id
// заранее (чек-аут для этого addon создаёт строку раньше, чем фронт узнаёт
// её id). Должен идти раньше '/:id' — иначе Express примет 'latest' за id.
router.get(
  '/latest',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, url, status, findings, score, zone, created_at, completed_at
       FROM website_checks WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.tenant.companyId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Не найдено' });
    res.json(rows[0]);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, url, status, findings, score, zone, created_at, completed_at
       FROM website_checks WHERE id = $1 AND company_id = $2`,
      [req.params.id, req.tenant.companyId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Не найдено' });
    res.json(rows[0]);
  })
);

// Без очереди (как и весь остальной async-код в этом проекте, см.
// roadmap_orders): пишем ответ клиенту сразу (202/поллинг), скан идёт в
// фоне, результат записывается по завершении. Вызывается и отсюда (бонус
// подписчику), и из вебхука ЮKassa (subscription.routes.js) для разовой
// покупки — единая функция, чтобы логика записи результата не дублировалась.
async function runScan(checkId, url) {
  try {
    const result = await scanWebsite(url);
    await pool.query(
      `UPDATE website_checks SET status = 'completed', findings = $2, score = $3, zone = $4, completed_at = now() WHERE id = $1`,
      [checkId, JSON.stringify(result.findings), result.score, result.zone]
    );
  } catch (err) {
    console.error('website scan failed:', err);
    await pool.query(`UPDATE website_checks SET status = 'failed', completed_at = now() WHERE id = $1`, [checkId]);
  }
}

// Гость (тест/лендинг без пароля, is_guest — см. anonymous-audit.routes.js)
// не держит сессию живой через редирект с ЮKassa (тот же приём, что и
// доставка купленного PDF-отчёта гостю, fulfillGuestReport) — результат
// уходит на email, полагаться на то, что браузер вернётся на страницу
// поллинга, нельзя.
async function notifyGuestIfNeeded(checkId) {
  const { rows } = await pool.query(
    `SELECT u.email, u.is_guest, wc.url, wc.score, wc.zone, wc.findings
     FROM website_checks wc
     JOIN memberships m ON m.company_id = wc.company_id AND m.role = 'owner'
     JOIN users u ON u.id = m.user_id
     WHERE wc.id = $1`,
    [checkId]
  );
  const row = rows[0];
  if (!row || !row.is_guest) return;
  const findings = row.findings || [];
  const list = findings.map((f) => `<li><b>${f.title}</b> — ${f.solution}</li>`).join('');
  await sendMail({
    to: row.email,
    subject: `Проверка сайта ${row.url} готова — «Безопасный бизнес»`,
    html:
      `<p>Проверка сайта ${row.url} завершена. Индекс: ${row.score} ` +
      `(${row.zone === 'green' ? 'риски не найдены' : row.zone === 'yellow' ? 'есть замечания' : 'высокий риск'}).</p>` +
      (list ? `<ul>${list}</ul>` : '<p>Замечаний не найдено.</p>') +
      `<p>Отчёт не заменяет юридическую консультацию.</p>`,
  });
}

// Вызывается из вебхука ЮKassa (subscription.routes.js, handleAddonWebhook)
// после подтверждения разовой покупки addon_key='website_check' —
// запускает тот же скан, что и бонус подписчику, плюс письмо гостю.
async function runScanForPurchase(checkId, url) {
  await pool.query(`UPDATE website_checks SET status = 'pending' WHERE id = $1`, [checkId]);
  await runScan(checkId, url);
  await notifyGuestIfNeeded(checkId).catch((err) => console.error('notifyGuestIfNeeded (website check) failed:', err));
}

module.exports = router;
module.exports.runScan = runScan;
module.exports.runScanForPurchase = runScanForPurchase;
