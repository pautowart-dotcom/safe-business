const crypto = require('crypto');
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { requireTestCompany } = require('../core/middleware/testCompany');
const { computeSecurityStatus } = require('../modules/security/status');

const router = express.Router();

// Тихая обкатка (11.08.2026) — франшиза принадлежит КОМПАНИИ, не
// пользователю: "свой аккаунт" у владельца франшизы — это его обычный
// владельческий аккаунт, без нового типа сессии/входа (см. план). Видна
// только is_test-компаниям — и владеющей, и каждой точке-партнёру
// (requireTestCompany проверяет req.tenant.companyId, т.е. КАЖДЫЙ вызов
// проверяется от лица компании, которая его делает, а не только владеющей).
router.use(requireAuth, requireTenant, requireRole('owner'), requireTestCompany);

async function generateJoinCode() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const { rows } = await pool.query('SELECT 1 FROM franchise_groups WHERE join_code = $1', [code]);
    if (rows.length === 0) return code;
  }
  throw new Error('Не удалось сгенерировать уникальный код приглашения');
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Укажите название франшизы' });
    }

    const { rows: companyRows } = await pool.query('SELECT franchise_group_id FROM companies WHERE id = $1', [req.tenant.companyId]);
    if (companyRows[0]?.franchise_group_id) {
      return res.status(409).json({ error: 'Компания уже состоит во франшизе — сначала выйдите из неё' });
    }
    const { rows: ownedRows } = await pool.query('SELECT 1 FROM franchise_groups WHERE owner_company_id = $1', [req.tenant.companyId]);
    if (ownedRows.length > 0) {
      return res.status(409).json({ error: 'Компания уже владеет франшизой' });
    }

    const joinCode = await generateJoinCode();
    const { rows } = await pool.query(
      `INSERT INTO franchise_groups (name, owner_company_id, join_code) VALUES ($1, $2, $3) RETURNING id, name, join_code`,
      [name.trim(), req.tenant.companyId, joinCode]
    );
    res.status(201).json({ id: rows[0].id, name: rows[0].name, joinCode: rows[0].join_code });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows: ownedRows } = await pool.query(
      `SELECT id, name, join_code FROM franchise_groups WHERE owner_company_id = $1`,
      [req.tenant.companyId]
    );
    if (ownedRows.length > 0) {
      const owned = ownedRows[0];
      const { rows: members } = await pool.query(
        `SELECT id, name FROM companies WHERE franchise_group_id = $1 ORDER BY name`,
        [owned.id]
      );
      const { rows: pendingRequests } = await pool.query(
        `SELECT jr.id, jr.requesting_company_id AS "companyId", c.name AS "companyName", jr.created_at AS "createdAt"
         FROM franchise_join_requests jr JOIN companies c ON c.id = jr.requesting_company_id
         WHERE jr.franchise_group_id = $1 AND jr.status = 'pending' ORDER BY jr.created_at`,
        [owned.id]
      );
      return res.json({
        owned: {
          id: owned.id,
          name: owned.name,
          joinCode: owned.join_code,
          members: members.map((m) => ({ companyId: m.id, companyName: m.name })),
          pendingRequests,
        },
        memberOf: null,
        pendingRequestSent: null,
      });
    }

    const { rows: companyRows } = await pool.query(
      `SELECT c.franchise_group_id AS "franchiseGroupId", fg.name
       FROM companies c LEFT JOIN franchise_groups fg ON fg.id = c.franchise_group_id
       WHERE c.id = $1`,
      [req.tenant.companyId]
    );
    if (companyRows[0]?.franchiseGroupId) {
      return res.json({ owned: null, memberOf: { franchiseGroupId: companyRows[0].franchiseGroupId, name: companyRows[0].name }, pendingRequestSent: null });
    }

    const { rows: pendingSent } = await pool.query(
      `SELECT jr.franchise_group_id AS "franchiseGroupId", fg.name, jr.created_at AS "createdAt"
       FROM franchise_join_requests jr JOIN franchise_groups fg ON fg.id = jr.franchise_group_id
       WHERE jr.requesting_company_id = $1 AND jr.status = 'pending'`,
      [req.tenant.companyId]
    );
    res.json({ owned: null, memberOf: null, pendingRequestSent: pendingSent[0] || null });
  })
);

router.post(
  '/join-requests',
  asyncHandler(async (req, res) => {
    const { joinCode } = req.body || {};
    if (!joinCode || typeof joinCode !== 'string') {
      return res.status(400).json({ error: 'Укажите код приглашения' });
    }

    const { rows: companyRows } = await pool.query('SELECT franchise_group_id FROM companies WHERE id = $1', [req.tenant.companyId]);
    if (companyRows[0]?.franchise_group_id) {
      return res.status(409).json({ error: 'Компания уже состоит во франшизе' });
    }
    const { rows: ownedRows } = await pool.query('SELECT 1 FROM franchise_groups WHERE owner_company_id = $1', [req.tenant.companyId]);
    if (ownedRows.length > 0) {
      return res.status(409).json({ error: 'Компания, владеющая своей франшизой, не может подать заявку в чужую' });
    }

    const { rows: franchiseRows } = await pool.query('SELECT id FROM franchise_groups WHERE join_code = $1', [joinCode.trim().toUpperCase()]);
    if (franchiseRows.length === 0) {
      return res.status(404).json({ error: 'Франшиза с таким кодом не найдена' });
    }

    try {
      await pool.query(
        `INSERT INTO franchise_join_requests (franchise_group_id, requesting_company_id) VALUES ($1, $2)`,
        [franchiseRows[0].id, req.tenant.companyId]
      );
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Заявка уже отправлена, ждите подтверждения' });
      }
      throw err;
    }
    res.status(201).json({ ok: true });
  })
);

router.patch(
  '/join-requests/:id',
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status должен быть approved или rejected' });
    }

    const { rows: requestRows } = await pool.query(
      `SELECT jr.id, jr.requesting_company_id, jr.status, fg.owner_company_id
       FROM franchise_join_requests jr JOIN franchise_groups fg ON fg.id = jr.franchise_group_id
       WHERE jr.id = $1`,
      [req.params.id]
    );
    const request = requestRows[0];
    if (!request || request.owner_company_id !== req.tenant.companyId) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }
    if (request.status !== 'pending') {
      return res.status(409).json({ error: 'Заявка уже рассмотрена' });
    }

    await pool.query('BEGIN');
    try {
      await pool.query(`UPDATE franchise_join_requests SET status = $1, decided_at = now() WHERE id = $2`, [status, request.id]);
      if (status === 'approved') {
        await pool.query(`UPDATE companies SET franchise_group_id = (SELECT franchise_group_id FROM franchise_join_requests WHERE id = $1) WHERE id = $2`, [
          request.id,
          request.requesting_company_id,
        ]);
      }
      await pool.query('COMMIT');
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
    res.json({ ok: true });
  })
);

router.delete(
  '/membership',
  asyncHandler(async (req, res) => {
    const { rows: ownedRows } = await pool.query('SELECT id FROM franchise_groups WHERE owner_company_id = $1', [req.tenant.companyId]);
    if (ownedRows.length > 0) {
      // Расформировать франшизу — companies.franchise_group_id обнулится каскадом (ON DELETE SET NULL).
      await pool.query('DELETE FROM franchise_groups WHERE id = $1', [ownedRows[0].id]);
      return res.status(204).end();
    }

    await pool.query('UPDATE companies SET franchise_group_id = NULL WHERE id = $1', [req.tenant.companyId]);
    res.status(204).end();
  })
);

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const { rows: ownedRows } = await pool.query('SELECT id FROM franchise_groups WHERE owner_company_id = $1', [req.tenant.companyId]);
    if (ownedRows.length === 0) {
      return res.status(404).json({ error: 'Вы не владеете франшизой' });
    }

    const { rows: members } = await pool.query('SELECT id, name FROM companies WHERE franchise_group_id = $1 ORDER BY name', [ownedRows[0].id]);
    const summary = await Promise.all(
      members.map(async (m) => {
        const status = await computeSecurityStatus(m.id);
        return {
          companyId: m.id,
          companyName: m.name,
          niches: status.testedNiches,
          indexPercent: status.indexPercent,
          zone: status.zone,
          violationsCount: status.violationsCount,
          resolvedCount: status.violations.filter((v) => v.status === 'resolved').length,
        };
      })
    );

    // Сводка по всей сети одним числом (владелец франшизы попросил это
    // отдельно от списка точек, 11.08.2026) — среднее по тем точкам, что уже
    // проходили тест, плюс счётчик по зонам. Точки без теста не тянут
    // среднее ни вверх, ни вниз — только считаются отдельно как "не проверено".
    const tested = summary.filter((m) => m.indexPercent != null);
    const zoneCounts = { green: 0, yellow: 0, red: 0 };
    for (const m of tested) zoneCounts[m.zone] += 1;
    const network = {
      pointsTotal: summary.length,
      pointsTested: tested.length,
      pointsUntested: summary.length - tested.length,
      averageIndexPercent: tested.length > 0 ? Math.round(tested.reduce((sum, m) => sum + m.indexPercent, 0) / tested.length) : null,
      zoneCounts,
    };

    res.json({ members: summary, network });
  })
);

module.exports = router;
