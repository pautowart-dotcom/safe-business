// «Ваш бизнес снаружи» (22.10.2026) — бэкенд страницы /outside.
// Бесплатно: разовый снимок открытых реестров по ИНН СВОЕГО бизнеса (не чаще
// раза в сутки). По подписке (accessLevel 'full'): фоновое наблюдение
// с уведомлениями (scripts/outsideWatchDaily.js). Других людей не проверяем.
//
// Включение: OUTSIDE_WATCH_ENABLED=true — для всех; без него — только
// тестовые компании (companies.is_test), как у бесплатного уровня.
// Путь в FREE_PATH_PREFIXES (core/freeTier.js).
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { accessLevel } = require('../core/freeTier');
const svc = require('../modules/outside-watch/service');
const { nichesForOkved } = require('../modules/outside-watch/okvedNiches');
const { checkOutsideAllowed, recordOutside } = require('../core/loginRateLimit');

const router = express.Router();

// Публично (до авторизации): показывать ли поле ИНН на первом экране
// гостевого теста — там ещё нет ни токена, ни компании. Только общий флаг.
router.get('/enabled', (req, res) => res.json({ enabled: process.env.OUTSIDE_WATCH_ENABLED === 'true' }));

router.use(requireAuth, requireTenant, requireRole('owner'));

router.use(
  asyncHandler(async (req, res, next) => {
    const { rows } = await pool.query('SELECT is_test FROM companies WHERE id = $1', [req.tenant.companyId]);
    if (!svc.enabledFor(rows[0])) return res.status(404).json({ error: 'Раздел пока недоступен' });
    next();
  })
);

function maskInn(inn) {
  return inn ? `${'•'.repeat(inn.length - 4)}${inn.slice(-4)}` : null;
}

const INN_ERRORS = { INVALID_INN: 400, CONFIRM_REQUIRED: 400, INN_MISMATCH: 400, INN_CHANGE_LIMIT: 429 };

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = req.tenant.companyId;
    const [{ inn }, snapshot, level, docInn] = await Promise.all([
      svc.getCompanyInn(companyId),
      svc.latestSnapshot(companyId),
      accessLevel(companyId),
      svc.documentsInn(companyId),
    ]);
    res.json({
      inn: maskInn(inn),
      hasInn: !!inn,
      // ИНН уже есть в реквизитах «Документов» — предлагаем его, не заставляя вводить.
      suggestedInn: !inn && docInn ? docInn : null,
      watchActive: level === 'full' && !!inn,
      paid: level === 'full',
      snapshot: snapshot && { createdAt: snapshot.created_at, findings: snapshot.findings, source: snapshot.source },
    });
  })
);

// Разовый снимок. ИНН можно не передавать — возьмём сохранённый.
router.post(
  '/snapshot',
  asyncHandler(async (req, res) => {
    const companyId = req.tenant.companyId;
    let inn;
    try {
      inn = req.body?.inn
        ? await svc.setCompanyInn(companyId, req.body.inn, { confirmOwn: req.body.confirmOwn === true })
        : (await svc.getCompanyInn(companyId)).inn;
    } catch (err) {
      if (INN_ERRORS[err.code]) return res.status(INN_ERRORS[err.code]).json({ error: err.message, code: err.code });
      throw err;
    }
    if (!inn) return res.status(400).json({ error: 'Укажите ИНН' });

    const last = await svc.latestSnapshot(companyId);
    const sameInn = last && last.summary && last.summary.inn === inn;
    if (sameInn && Date.now() - new Date(last.created_at).getTime() < 24 * 3600 * 1000) {
      return res.status(429).json({ error: 'Снимок обновляется не чаще раза в сутки — ниже последний.' });
    }
    if (!(await checkOutsideAllowed(req.ip))) {
      return res.status(429).json({ error: 'Слишком много проверок с этого устройства — попробуйте завтра.' });
    }
    await recordOutside(req.ip);
    try {
      const { row } = await svc.takeSnapshot(companyId, inn, 'free');
      res.json({ createdAt: row.created_at, findings: row.findings, source: row.source });
    } catch (err) {
      if (err.code === 'BUDGET') return res.status(503).json({ error: 'Сегодня проверок уже очень много — попробуйте завтра.', code: 'BUDGET' });
      console.error('outside-watch snapshot failed', companyId, err.code, err.message);
      res.status(502).json({ error: 'Реестры сейчас не ответили — попробуйте позже.' });
    }
  })
);

// Подсказки для теста (22.10.2026): по ИНН своего бизнеса — форма, подсказка
// ниши по ОКВЭД; пустые поля компании (регион, дата регистрации, патент)
// заполняются сами. 1 запрос к реестру. Реестр не ответил или лимит дня —
// не ошибка для человека: тест просто идёт как обычно.
router.post(
  '/prefill',
  asyncHandler(async (req, res) => {
    const companyId = req.tenant.companyId;
    let inn;
    try {
      inn = await svc.setCompanyInn(companyId, req.body?.inn, { confirmOwn: req.body?.confirmOwn === true });
    } catch (err) {
      if (INN_ERRORS[err.code]) return res.status(INN_ERRORS[err.code]).json({ error: err.message, code: err.code });
      throw err;
    }
    const legalForm = inn.length === 10 ? 'ooo' : 'ip';
    // Лимит по IP — как «реестр не ответил»: тест идёт дальше без подсказок.
    if (!(await checkOutsideAllowed(req.ip))) return res.json({ found: false, legalForm });
    await recordOutside(req.ip);
    let card = null;
    try {
      card = await svc.fetchCard(inn);
    } catch (err) {
      console.error('outside-watch prefill failed', companyId, err.code, err.message);
      return res.json({ found: false, legalForm });
    }
    // 12 цифр и нет в ЕГРИП — скорее всего самозанятый (личный ИНН).
    if (!card) return res.json({ found: false, legalForm: inn.length === 12 ? 'self_employed' : legalForm });
    await svc.applyRegistryToCompany(companyId, inn, card);
    const okved = card.ОКВЭД || {};
    res.json({
      found: true,
      legalForm,
      name: card.НаимСокр || (card.ФИО ? `ИП ${card.ФИО}` : null),
      okved: okved.Код ? { code: okved.Код, name: okved.Наим } : null,
      suggestedNiches: nichesForOkved(okved.Код),
      regimes: (card.Налоги && card.Налоги.ОсобРежим) || [],
    });
  })
);

module.exports = router;
