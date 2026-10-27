const crypto = require('crypto');
const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { computeNetworkSummary, RED_REASON } = require('../modules/franchise/networkSummary');
const { buildMonthlyReport, currentMonth, isMonth } = require('../modules/franchise/report');
const { renderNetworkReportPdf } = require('./networkReportPdf');
const { logAudit } = require('../core/auditLog');
const { networkAccess } = require('../core/franchiseAccess');

const router = express.Router();

// Франшиза принадлежит КОМПАНИИ, не пользователю (11.08.2026): у владельца
// сети нет отдельного типа входа — это его обычный владельческий аккаунт.
//
// 16.10.2026 (этап 2, docs/franchise-funkcional.md §11) — снят флаг is_test:
// - создать сеть может компания с franchise_enabled (включается в /office)
//   или тестовая;
// - вступить по ссылке-приглашению может любая компания, с явным согласием
//   на то, что сеть видит её сводку (consented_at);
// - пульт видит владелец сети и администраторы его компании, которым он сам
//   выдал доступ (franchise_group_viewers) — только просмотр.
// Что сеть видит о точке: название, индекс и зону, число нарушений и
// исправленных, число подошедших сроков, шаг открытия, давность активности.
// Без ФИО, документов, клиентов и финансов точки.
router.use(requireAuth, requireTenant);

// Точка вышла из сети — убираем её из всех снимков сети (решение владельца
// 16.10.2026: выход = отзыв согласия, сеть больше не хранит её данные).
async function forgetPoint(groupId, companyId) {
  await pool.query(
    `UPDATE franchise_network_snapshots
     SET data = jsonb_set(data, '{points}', COALESCE((
       SELECT jsonb_agg(p) FROM jsonb_array_elements(data->'points') p WHERE (p->>'companyId')::int <> $2
     ), '[]'::jsonb))
     WHERE franchise_group_id = $1`,
    [groupId, companyId]
  );
  // Стандарты сети (миграция 0138): самопроверки и проверки от сети этой
  // точки сеть тоже больше не хранит.
  await pool.query('DELETE FROM franchise_standard_checks WHERE franchise_group_id = $1 AND company_id = $2', [groupId, companyId]);
}

async function generateJoinCode() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const { rows } = await pool.query('SELECT 1 FROM franchise_groups WHERE join_code = $1', [code]);
    if (rows.length === 0) return code;
  }
  throw new Error('Не удалось сгенерировать уникальный код приглашения');
}

async function requireNetworkManager(req, res) {
  const access = await networkAccess(req);
  if (!access || !access.canManage) {
    res.status(404).json({ error: 'Вы не владеете сетью' });
    return null;
  }
  return access;
}

router.get(
  '/',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const access = await networkAccess(req);
    if (access) {
      const owned = { id: access.group.id, name: access.group.name, canManage: access.canManage };
      if (access.canManage) {
        const { rows: pendingRequests } = await pool.query(
          `SELECT jr.id, jr.requesting_company_id AS "companyId", c.name AS "companyName", jr.created_at AS "createdAt"
           FROM franchise_join_requests jr JOIN companies c ON c.id = jr.requesting_company_id
           WHERE jr.franchise_group_id = $1 AND jr.status = 'pending' ORDER BY jr.created_at`,
          [access.group.id]
        );
        const { rows: countRows } = await pool.query('SELECT count(*)::int AS n FROM companies WHERE franchise_group_id = $1', [access.group.id]);
        owned.joinCode = access.group.join_code;
        owned.pendingRequests = pendingRequests;
        owned.membersCount = countRows[0].n;
      }
      return res.json({ owned, memberOf: null, pendingRequestSent: null, canCreate: false });
    }

    // Администратор без доступа к пульту в сетях не участвует — вступает и
    // выходит из сети только владелец точки.
    if (req.tenant.role !== 'owner') {
      return res.json({ owned: null, memberOf: null, pendingRequestSent: null, canCreate: false });
    }

    const { rows: companyRows } = await pool.query(
      `SELECT c.franchise_group_id AS "franchiseGroupId", fg.name, c.is_test, c.franchise_enabled
       FROM companies c LEFT JOIN franchise_groups fg ON fg.id = c.franchise_group_id
       WHERE c.id = $1`,
      [req.tenant.companyId]
    );
    const company = companyRows[0];
    if (company?.franchiseGroupId) {
      return res.json({ owned: null, memberOf: { franchiseGroupId: company.franchiseGroupId, name: company.name }, pendingRequestSent: null, canCreate: false });
    }

    const { rows: pendingSent } = await pool.query(
      `SELECT jr.franchise_group_id AS "franchiseGroupId", fg.name, jr.created_at AS "createdAt"
       FROM franchise_join_requests jr JOIN franchise_groups fg ON fg.id = jr.franchise_group_id
       WHERE jr.requesting_company_id = $1 AND jr.status = 'pending'`,
      [req.tenant.companyId]
    );
    res.json({
      owned: null,
      memberOf: null,
      pendingRequestSent: pendingSent[0] || null,
      canCreate: !pendingSent[0] && !!(company?.is_test || company?.franchise_enabled),
    });
  })
);

router.post(
  '/',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Укажите название сети' });
    }

    const { rows: companyRows } = await pool.query('SELECT franchise_group_id, is_test, franchise_enabled FROM companies WHERE id = $1', [req.tenant.companyId]);
    const company = companyRows[0];
    if (!company?.is_test && !company?.franchise_enabled) {
      return res.status(403).json({ error: 'Кабинет сети подключается по запросу — напишите в поддержку' });
    }
    if (company.franchise_group_id) {
      return res.status(409).json({ error: 'Компания уже состоит в сети — сначала выйдите из неё' });
    }
    const { rows: ownedRows } = await pool.query('SELECT 1 FROM franchise_groups WHERE owner_company_id = $1', [req.tenant.companyId]);
    if (ownedRows.length > 0) {
      return res.status(409).json({ error: 'Компания уже владеет сетью' });
    }
    // Иначе компания могла бы стать и владельцем своей сети, и точкой чужой.
    const { rows: pendingRows } = await pool.query(
      `SELECT 1 FROM franchise_join_requests WHERE requesting_company_id = $1 AND status = 'pending'`,
      [req.tenant.companyId]
    );
    if (pendingRows.length > 0) {
      return res.status(409).json({ error: 'У компании есть заявка в другую сеть — дождитесь ответа или отзовите её' });
    }

    const joinCode = await generateJoinCode();
    const { rows } = await pool.query(
      `INSERT INTO franchise_groups (name, owner_company_id, join_code) VALUES ($1, $2, $3) RETURNING id, name, join_code`,
      [name.trim().slice(0, 150), req.tenant.companyId, joinCode]
    );
    res.status(201).json({ id: rows[0].id, name: rows[0].name, joinCode: rows[0].join_code });
  })
);

// Экран вступления по ссылке (/lk/join-network/:code) — показать название
// сети до согласия. Только название, больше ничего о сети.
router.get(
  '/join-preview/:code',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT name, owner_company_id FROM franchise_groups WHERE join_code = $1', [String(req.params.code).trim().toUpperCase()]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Сеть по этой ссылке не найдена — попросите новую ссылку' });
    }
    res.json({ name: rows[0].name, isOwnNetwork: rows[0].owner_company_id === req.tenant.companyId });
  })
);

router.post(
  '/join-requests',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { joinCode, consent } = req.body || {};
    if (!joinCode || typeof joinCode !== 'string') {
      return res.status(400).json({ error: 'Укажите код приглашения' });
    }
    if (consent !== true) {
      return res.status(400).json({ error: 'Нужно согласие на то, что сеть будет видеть сводку по вашей точке' });
    }

    const { rows: companyRows } = await pool.query('SELECT franchise_group_id FROM companies WHERE id = $1', [req.tenant.companyId]);
    if (companyRows[0]?.franchise_group_id) {
      return res.status(409).json({ error: 'Компания уже состоит в сети' });
    }
    const { rows: ownedRows } = await pool.query('SELECT 1 FROM franchise_groups WHERE owner_company_id = $1', [req.tenant.companyId]);
    if (ownedRows.length > 0) {
      return res.status(409).json({ error: 'Компания, владеющая своей сетью, не может подать заявку в чужую' });
    }

    const { rows: franchiseRows } = await pool.query('SELECT id FROM franchise_groups WHERE join_code = $1', [joinCode.trim().toUpperCase()]);
    if (franchiseRows.length === 0) {
      return res.status(404).json({ error: 'Сеть с таким кодом не найдена' });
    }

    try {
      await pool.query(
        `INSERT INTO franchise_join_requests (franchise_group_id, requesting_company_id, consented_at) VALUES ($1, $2, now())`,
        [franchiseRows[0].id, req.tenant.companyId]
      );
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Заявка уже отправлена, ждите подтверждения' });
      }
      throw err;
    }
    await logAudit({
      companyId: req.tenant.companyId,
      userId: req.user.id,
      action: 'franchise.join_requested',
      entityType: 'franchise_group',
      entityId: franchiseRows[0].id,
    });
    res.status(201).json({ ok: true });
  })
);

router.patch(
  '/join-requests/:id',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status должен быть approved или rejected' });
    }

    const { rows: requestRows } = await pool.query(
      `SELECT jr.id, jr.requesting_company_id, jr.status, jr.consented_at, fg.owner_company_id,
              c.franchise_group_id AS current_group_id,
              EXISTS (SELECT 1 FROM franchise_groups own WHERE own.owner_company_id = jr.requesting_company_id) AS owns_network
       FROM franchise_join_requests jr
       JOIN franchise_groups fg ON fg.id = jr.franchise_group_id
       JOIN companies c ON c.id = jr.requesting_company_id
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
    if (status === 'approved') {
      // Заявки до 16.10.2026 подавались без согласия на показ сводки сети.
      if (!request.consented_at) {
        return res.status(409).json({ error: 'Заявка подана без согласия точки — попросите точку подать заявку заново по ссылке' });
      }
      // Точка за это время вступила в другую сеть или завела свою.
      if (request.current_group_id || request.owns_network) {
        await pool.query(`UPDATE franchise_join_requests SET status = 'rejected', decided_at = now() WHERE id = $1`, [request.id]);
        return res.status(409).json({ error: 'Точка уже состоит в другой сети или владеет своей — заявка закрыта' });
      }
    }

    // Выделенный client — BEGIN/COMMIT через pool.query() могли уйти на
    // разные соединения пула (см. visits.routes.js, packages.routes.js).
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE franchise_join_requests SET status = $1, decided_at = now() WHERE id = $2`, [status, request.id]);
      if (status === 'approved') {
        // franchise_group_id IS NULL — точка могла за это время вступить в
        // другую сеть (заявка одна, но проверка дешёвая).
        await client.query(
          `UPDATE companies SET franchise_group_id = (SELECT franchise_group_id FROM franchise_join_requests WHERE id = $1)
           WHERE id = $2 AND franchise_group_id IS NULL`,
          [request.id, request.requesting_company_id]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json({ ok: true });
  })
);

// Выйти из сети (точка) или расформировать сеть (владелец сети).
router.delete(
  '/membership',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const { rows: ownedRows } = await pool.query('SELECT id FROM franchise_groups WHERE owner_company_id = $1', [req.tenant.companyId]);
    if (ownedRows.length > 0) {
      // companies.franchise_group_id обнулится каскадом (ON DELETE SET NULL).
      await pool.query('DELETE FROM franchise_groups WHERE id = $1', [ownedRows[0].id]);
      return res.status(204).end();
    }

    const { rows: left } = await pool.query(
      'UPDATE companies c SET franchise_group_id = NULL FROM companies old WHERE c.id = $1 AND old.id = c.id RETURNING old.franchise_group_id AS group_id',
      [req.tenant.companyId]
    );
    if (left[0]?.group_id) await forgetPoint(left[0].group_id, req.tenant.companyId);
    res.status(204).end();
  })
);

// Владелец сети убирает точку из сети (продали, закрылась, ошибка).
router.delete(
  '/members/:companyId',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const access = await requireNetworkManager(req, res);
    if (!access) return;
    const { rowCount } = await pool.query(
      'UPDATE companies SET franchise_group_id = NULL WHERE id = $1 AND franchise_group_id = $2',
      [req.params.companyId, access.group.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Точка не найдена в сети' });
    await forgetPoint(access.group.id, Number(req.params.companyId));
    res.status(204).end();
  })
);

// Администраторы компании владельца сети и есть ли у них доступ к пульту.
router.get(
  '/viewers',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const access = await requireNetworkManager(req, res);
    if (!access) return;
    const { rows } = await pool.query(
      `SELECT m.id AS "membershipId", u.name, u.email,
              EXISTS (SELECT 1 FROM franchise_group_viewers v WHERE v.franchise_group_id = $2 AND v.membership_id = m.id) AS granted
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.company_id = $1 AND m.role = 'admin' AND m.invite_status = 'active' AND m.active = true
       ORDER BY u.name`,
      [req.tenant.companyId, access.group.id]
    );
    res.json(rows);
  })
);

router.put(
  '/viewers/:membershipId',
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const access = await requireNetworkManager(req, res);
    if (!access) return;
    const { granted } = req.body || {};
    if (typeof granted !== 'boolean') {
      return res.status(400).json({ error: 'granted должен быть true или false' });
    }
    // Только администратор этой же компании — не чужое членство по подставленному id.
    const { rows } = await pool.query(
      `SELECT 1 FROM memberships WHERE id = $1 AND company_id = $2 AND role = 'admin' AND invite_status = 'active' AND active = true`,
      [req.params.membershipId, req.tenant.companyId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Администратор не найден' });

    if (granted) {
      await pool.query(
        `INSERT INTO franchise_group_viewers (franchise_group_id, membership_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [access.group.id, req.params.membershipId]
      );
    } else {
      await pool.query('DELETE FROM franchise_group_viewers WHERE franchise_group_id = $1 AND membership_id = $2', [access.group.id, req.params.membershipId]);
    }
    await logAudit({
      companyId: req.tenant.companyId,
      userId: req.user.id,
      action: granted ? 'franchise.viewer_granted' : 'franchise.viewer_revoked',
      entityType: 'membership',
      entityId: Number(req.params.membershipId),
    });
    res.json({ ok: true });
  })
);

router.get(
  '/summary',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const access = await networkAccess(req);
    if (!access) {
      return res.status(404).json({ error: 'Нет доступа к пульту сети' });
    }
    const { members, network } = await computeNetworkSummary(access.group);
    if (access.canManage) return res.json({ members, network, canManage: true });
    // Сотрудники сети (решение владельца 16.10.2026) — только сроки, открытие
    // и активность; индекс, зоны и нарушения точек видит один владелец сети.
    res.json({
      canManage: false,
      network: { name: network.name, pointsTotal: network.pointsTotal, pointsPreparing: network.pointsPreparing, deadlinesDue: network.deadlinesDue },
      members: members.map((m) => ({
        companyId: m.companyId,
        companyName: m.companyName,
        opening: m.opening,
        overdueDeadlines: m.overdueDeadlines,
        lastActiveAt: m.lastActiveAt,
        riskReasons: m.riskReasons.filter((r) => r !== RED_REASON),
      })),
    });
  })
);

// Ежемесячный отчёт (этап 4: Ф28) — ?month=YYYY-MM, по умолчанию текущий.
router.get(
  '/report',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    // Отчёт с индексами точек — только владельцу сети (решение 16.10.2026).
    const access = await networkAccess(req);
    if (!access?.canManage) return res.status(404).json({ error: 'Отчёт доступен владельцу сети' });
    const month = req.query.month || currentMonth();
    if (!isMonth(month)) return res.status(400).json({ error: 'Некорректный месяц' });
    res.json(await buildMonthlyReport(access.group, month));
  })
);

router.get(
  '/report/pdf',
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    // Отчёт с индексами точек — только владельцу сети (решение 16.10.2026).
    const access = await networkAccess(req);
    if (!access?.canManage) return res.status(404).json({ error: 'Отчёт доступен владельцу сети' });
    const month = req.query.month || currentMonth();
    if (!isMonth(month)) return res.status(400).json({ error: 'Некорректный месяц' });
    const pdf = await renderNetworkReportPdf(await buildMonthlyReport(access.group, month));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="otchet-seti-${month}.pdf"`);
    res.send(pdf);
  })
);

module.exports = router;
