// Публичная форма проверки по ссылке (17.10.2026, миграция 0139) — для
// проверяющего без аккаунта: тайного покупателя, супервайзера. Без входа:
// токен непредсказуем, одноразовый, живёт 14 дней; лимит попыток по IP+токену
// — тот же приём, что в leads-public.routes.js. Ссылку создаёт сеть:
// POST /platform/franchise-standards/network/audit-links.
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { checkLoginAllowed, recordFailedLogin } = require('../core/loginRateLimit');
const { notifyCompany } = require('../core/notifications');
const { listStandards, saveCheck } = require('../modules/franchise/standards');

const router = express.Router();

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

// Ссылка действительна, пока точка всё ещё в этой сети.
async function findLink(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{32,64}$/.test(token)) return null;
  const { rows } = await pool.query(
    `SELECT l.token, l.franchise_group_id, l.company_id, l.auditor_label, l.expires_at, l.used_at,
            fg.name AS network_name, fg.owner_company_id, c.name AS point_name
     FROM franchise_audit_links l
     JOIN franchise_groups fg ON fg.id = l.franchise_group_id
     JOIN companies c ON c.id = l.company_id AND c.franchise_group_id = l.franchise_group_id
     WHERE l.token = $1`,
    [token]
  );
  return rows[0] || null;
}

function linkProblem(link) {
  if (!link) return 'Ссылка не найдена — попросите сеть прислать новую';
  if (link.used_at) return 'По этой ссылке проверка уже отправлена';
  if (new Date(link.expires_at) < new Date()) return 'Срок действия ссылки закончился — попросите сеть прислать новую';
  return null;
}

router.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const link = await findLink(req.params.token);
    const problem = linkProblem(link);
    if (problem) return res.status(404).json({ error: problem });
    res.json({
      networkName: link.network_name,
      pointName: link.point_name,
      auditorLabel: link.auditor_label,
      standards: await listStandards(link.franchise_group_id),
    });
  })
);

router.post(
  '/:token',
  asyncHandler(async (req, res) => {
    const rateKey = `franchise-audit:${String(req.params.token).slice(0, 64)}`;
    if (!(await checkLoginAllowed(req.ip, rateKey))) {
      return res.status(429).json({ error: 'Слишком много попыток — попробуйте позже' });
    }
    const link = await findLink(req.params.token);
    const problem = linkProblem(link);
    if (problem) {
      await recordFailedLogin(req.ip, rateKey);
      return res.status(404).json({ error: problem });
    }
    const { answers, visitedOn, comment, auditorName } = req.body || {};
    if (visitedOn && !isDate(visitedOn)) return res.status(400).json({ error: 'Некорректная дата визита' });

    // Занимаем ссылку до записи — две одновременные отправки не создадут две проверки.
    const { rowCount } = await pool.query('UPDATE franchise_audit_links SET used_at = now() WHERE token = $1 AND used_at IS NULL', [link.token]);
    if (rowCount === 0) return res.status(409).json({ error: 'По этой ссылке проверка уже отправлена' });

    const label = [link.auditor_label, typeof auditorName === 'string' ? auditorName.trim().slice(0, 60) : '']
      .filter(Boolean).join(' · ').slice(0, 120) || 'Проверяющий по ссылке';
    let saved;
    try {
      saved = await saveCheck({
        groupId: link.franchise_group_id,
        companyId: link.company_id,
        kind: 'audit',
        auditorLabel: label,
        visitedOn,
        comment: typeof comment === 'string' ? comment.trim().slice(0, 2000) : null,
        answers,
        userId: null,
      });
    } catch (err) {
      await pool.query('UPDATE franchise_audit_links SET used_at = NULL WHERE token = $1', [link.token]);
      if (err.status === 400) return res.status(400).json({ error: err.message });
      throw err;
    }
    await pool.query('UPDATE franchise_audit_links SET check_id = $1 WHERE token = $2', [saved.checkId, link.token]);

    notifyCompany({
      companyId: link.company_id,
      kind: 'network',
      title: `Проверка от сети: ${saved.percent ?? '—'}% по стандартам`,
      body: 'Что отмечено и что поправить — в разделе «Стандарты сети».',
      url: '/network-standards',
      dedupeKey: `franchise_audit:${saved.checkId}`,
    }).catch((err) => console.error('franchise audit notify failed', saved.checkId, err));
    notifyCompany({
      companyId: link.owner_company_id,
      kind: 'network',
      title: `Проверка «${link.point_name}» получена: ${saved.percent ?? '—'}%`,
      body: label,
      url: '/network/standards',
      dedupeKey: `franchise_audit_owner:${saved.checkId}`,
    }).catch((err) => console.error('franchise audit owner notify failed', saved.checkId, err));

    res.status(201).json({ ok: true });
  })
);

module.exports = router;
