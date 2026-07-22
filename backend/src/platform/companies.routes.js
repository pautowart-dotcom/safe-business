const express = require('express');
const pool = require('../db/pool');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../core/middleware/auth');
const { requireTenant } = require('../core/middleware/tenancy');
const { requireRole } = require('../core/middleware/role');
const { studioOsBundleKeys } = require('../core/modules-registry');
const { logEvent } = require('../core/eventLog');
const { logAudit } = require('../core/auditLog');
const { TAX_REGIMES, syncTaxDeadlines } = require('../core/taxDeadlines');

const router = express.Router();

// Владелец может завести дополнительную компанию под тем же аккаунтом
// (например вторую студию) — не только при регистрации.
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name, industrySegment } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Укажите название компании' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const companyResult = await client.query(
        `INSERT INTO companies (name, industry_segment, created_by_user_id, trial_ends_at)
         VALUES ($1, $2, $3, now() + interval '30 days')
         RETURNING id, name`,
        [name, industrySegment || null, req.user.id]
      );
      const company = companyResult.rows[0];

      const membershipResult = await client.query(
        `INSERT INTO memberships (user_id, company_id, role, invite_status)
         VALUES ($1, $2, 'owner', 'active') RETURNING id, role, branch_id`,
        [req.user.id, company.id]
      );
      const membership = membershipResult.rows[0];

      for (const moduleKey of studioOsBundleKeys()) {
        await client.query(
          `INSERT INTO company_modules (company_id, module_key, enabled) VALUES ($1, $2, true)
           ON CONFLICT (company_id, module_key) DO NOTHING`,
          [company.id, moduleKey]
        );
      }

      await client.query('COMMIT');
      await logEvent({
        companyId: company.id,
        moduleKey: 'platform',
        userId: req.user.id,
        entityType: 'company',
        entityId: company.id,
        action: 'company.registered',
      });
      await logAudit({
        companyId: company.id,
        userId: req.user.id,
        action: 'company.registered',
        entityType: 'company',
        entityId: company.id,
      });

      res.status(201).json({
        companyId: company.id,
        companyName: company.name,
        membershipId: membership.id,
        role: membership.role,
        branchId: membership.branch_id,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

router.get(
  '/current',
  requireAuth,
  requireTenant,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, name, industry_segment, subscription_status, plan_key, trial_ends_at, tax_regime,
              to_char(ip_registered_at, 'YYYY-MM-DD') AS ip_registered_at, has_employees,
              to_char(sout_last_at, 'YYYY-MM-DD') AS sout_last_at, created_at
       FROM companies WHERE id = $1`,
      [req.tenant.companyId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Компания не найдена' });
    }
    res.json(rows[0]);
  })
);

router.get('/tax-regimes', requireAuth, (req, res) => res.json(TAX_REGIMES));

router.patch(
  '/current',
  requireAuth,
  requireTenant,
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { name, industrySegment, taxRegime, ipRegisteredAt, hasEmployees } = req.body;
    // taxRegime может прийти '' (сброс режима на "не указан" из фронта) —
    // это валидный случай, отличный от неизвестного ключа.
    if (taxRegime && !TAX_REGIMES.some((r) => r.key === taxRegime)) {
      return res.status(400).json({ error: 'Неизвестный налоговый режим' });
    }

    const { rows } = await pool.query(
      `UPDATE companies SET
         name = COALESCE($1, name),
         industry_segment = COALESCE($2, industry_segment),
         tax_regime = CASE WHEN $3 THEN $4 ELSE tax_regime END,
         ip_registered_at = CASE WHEN $5 THEN $6 ELSE ip_registered_at END,
         has_employees = CASE WHEN $7 THEN $8 ELSE has_employees END
       WHERE id = $9
       RETURNING id, name, industry_segment, subscription_status, trial_ends_at, tax_regime,
                 to_char(ip_registered_at, 'YYYY-MM-DD') AS ip_registered_at, has_employees,
                 to_char(sout_last_at, 'YYYY-MM-DD') AS sout_last_at, created_at`,
      [
        name || null, industrySegment || null,
        taxRegime !== undefined, taxRegime || null,
        ipRegisteredAt !== undefined, ipRegisteredAt || null,
        hasEmployees !== undefined, hasEmployees === undefined ? null : !!hasEmployees,
        req.tenant.companyId,
      ]
    );

    // Пакет 4, Этап 2: любое из трёх исходных данных для налоговых
    // напоминаний (режим/дата регистрации/сотрудники) может измениться
    // независимо — пересчитываем слоты по актуальному состоянию компании
    // целиком, а не только по тому полю, что пришло в этом запросе.
    if (taxRegime !== undefined || ipRegisteredAt !== undefined || hasEmployees !== undefined) {
      await syncTaxDeadlines(req.tenant.companyId, rows[0].tax_regime, {
        ipRegisteredAt: rows[0].ip_registered_at,
        hasEmployees: rows[0].has_employees,
      });
    }

    res.json(rows[0]);
  })
);

module.exports = router;
