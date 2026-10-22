// «Ваш бизнес снаружи» (22.10.2026) — бэкенд страницы /outside.
// Бесплатно: разовый снимок открытых реестров по ИНН (не чаще раза в сутки).
// По подписке (accessLevel 'full'): ежедневное наблюдение с уведомлениями
// (scripts/outsideWatchDaily.js) и проверка статуса самозанятых мастеров.
//
// Включение: OUTSIDE_WATCH_ENABLED=true — для всех; без него — только
// тестовые компании (companies.is_test), как у бесплатного уровня.
// Путь в FREE_PATH_PREFIXES (core/freeTier.js) — платное отсекаем здесь
// сами, ответом 402 paidFeature.
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { accessLevel } = require('../core/freeTier');
const { encrypt } = require('../core/crypto');
const svc = require('../modules/outside-watch/service');
const { checkSelfEmployed } = require('../modules/outside-watch/npdClient');

const router = express.Router();
router.use(requireAuth, requireTenant, requireRole('owner'));

const MAX_MASTERS = 30;

router.use(
  asyncHandler(async (req, res, next) => {
    const { rows } = await pool.query('SELECT is_test FROM companies WHERE id = $1', [req.tenant.companyId]);
    if (!svc.enabledFor(rows[0])) return res.status(404).json({ error: 'Раздел пока недоступен' });
    next();
  })
);

async function requirePaid(req, res) {
  if ((await accessLevel(req.tenant.companyId)) === 'full') return true;
  res.status(402).json({ error: 'Это входит в подписку — оформите её в разделе «Подписка».', paidFeature: true });
  return false;
}

function maskInn(inn) {
  return inn ? `${'•'.repeat(inn.length - 4)}${inn.slice(-4)}` : null;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = req.tenant.companyId;
    const [inn, snapshot, level, masters] = await Promise.all([
      svc.getCompanyInn(companyId),
      svc.latestSnapshot(companyId),
      accessLevel(companyId),
      pool.query(
        `SELECT id, label, inn_tail, last_status, last_checked_at FROM outside_watch_masters
         WHERE company_id = $1 ORDER BY created_at`,
        [companyId]
      ),
    ]);
    res.json({
      inn: maskInn(inn),
      hasInn: !!inn,
      watchActive: level === 'full' && !!inn,
      paid: level === 'full',
      snapshot: snapshot && { createdAt: snapshot.created_at, findings: snapshot.findings, source: snapshot.source },
      masters: masters.rows,
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
      inn = req.body?.inn ? await svc.setCompanyInn(companyId, req.body.inn) : await svc.getCompanyInn(companyId);
    } catch (err) {
      if (err.code === 'INVALID_INN') return res.status(400).json({ error: err.message });
      throw err;
    }
    if (!inn) return res.status(400).json({ error: 'Укажите ИНН' });

    const last = await svc.latestSnapshot(companyId);
    const sameInn = last && last.summary && last.summary.inn === inn;
    if (sameInn && Date.now() - new Date(last.created_at).getTime() < 24 * 3600 * 1000) {
      return res.status(429).json({ error: 'Снимок обновляется не чаще раза в сутки — ниже последний.' });
    }
    if ((await svc.snapshotsToday()) >= svc.DAILY_SNAPSHOT_CAP) {
      return res.status(503).json({ error: 'Сегодня проверок уже очень много — попробуйте завтра.' });
    }

    try {
      const { row } = await svc.takeSnapshot(companyId, inn, 'free');
      res.json({ createdAt: row.created_at, findings: row.findings, source: row.source });
    } catch (err) {
      console.error('outside-watch snapshot failed', companyId, err.code, err.message);
      res.status(502).json({ error: 'Реестры сейчас не ответили — попробуйте позже.' });
    }
  })
);

// Самозанятые мастера — по подписке.
router.post(
  '/masters',
  asyncHandler(async (req, res) => {
    if (!(await requirePaid(req, res))) return;
    const label = String(req.body?.label || '').trim().slice(0, 120);
    const inn = String(req.body?.inn || '').trim();
    if (!label) return res.status(400).json({ error: 'Укажите имя мастера' });
    if (!/^\d{12}$/.test(inn)) return res.status(400).json({ error: 'ИНН самозанятого — 12 цифр' });
    const { rows: cnt } = await pool.query('SELECT COUNT(*)::int AS n FROM outside_watch_masters WHERE company_id = $1', [req.tenant.companyId]);
    if (cnt[0].n >= MAX_MASTERS) return res.status(400).json({ error: `Не больше ${MAX_MASTERS} мастеров` });
    const { rows } = await pool.query(
      `INSERT INTO outside_watch_masters (company_id, label, inn_enc, inn_tail)
       VALUES ($1, $2, $3, $4) RETURNING id, label, inn_tail, last_status, last_checked_at`,
      [req.tenant.companyId, label, encrypt(inn), inn.slice(-4)]
    );
    // Сразу проверяем одного — ФНС разрешает 2 запроса в минуту, на одну
    // кнопку этого хватает; остальное делает ежедневный скрипт.
    const master = rows[0];
    try {
      const r = await checkSelfEmployed(inn);
      const upd = await pool.query(
        `UPDATE outside_watch_masters SET last_status = $2, last_checked_at = now() WHERE id = $1
         RETURNING id, label, inn_tail, last_status, last_checked_at`,
        [master.id, r.status]
      );
      return res.json(upd.rows[0]);
    } catch (err) {
      console.error('outside-watch npd check failed', master.id, err.code, err.message);
      return res.json(master);
    }
  })
);

router.delete(
  '/masters/:id',
  asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM outside_watch_masters WHERE id = $1 AND company_id = $2', [req.params.id, req.tenant.companyId]);
    res.json({ ok: true });
  })
);

module.exports = router;
