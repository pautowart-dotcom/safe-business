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

    // requireAuth (не requireTenant) — так и должно быть: этим же роутом
    // заводит самую первую компанию человек, у которого их вообще ещё нет
    // (Super Admin при первом входе). Но раньше здесь не было вообще
    // никакой проверки роли для случая "компании уже есть" — админ или
    // мастер, оказавшись на экране "Сменить компанию" → "+ Добавить
    // студию", тоже мог бы завести отдельную новую компанию и стать её
    // владельцем, хотя по смыслу это действие только для владельца.
    const existingMemberships = await pool.query(
      `SELECT 1 FROM memberships WHERE user_id = $1 AND invite_status = 'active' AND role = 'owner' LIMIT 1`,
      [req.user.id]
    );
    const hasAnyMembership = await pool.query(
      `SELECT 1 FROM memberships WHERE user_id = $1 AND invite_status = 'active' LIMIT 1`,
      [req.user.id]
    );
    if (hasAnyMembership.rows.length > 0 && existingMemberships.rows.length === 0) {
      return res.status(403).json({ error: 'Заводить новую компанию может только владелец' });
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

      // См. комментарий в auth.routes.js (register) — то же решение
      // владельца (31.07.2026), тот же список по умолчанию.
      for (const moduleKey of [...studioOsBundleKeys(), 'clients', 'visits']) {
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
    const [companyRes, nichesRes] = await Promise.all([
      pool.query(
        `SELECT id, name, industry_segment, subscription_status, plan_key, trial_ends_at, tax_regime,
                subscription_current_period_end, subscription_price_rub,
                to_char(ip_registered_at, 'YYYY-MM-DD') AS ip_registered_at, has_employees,
                to_char(sout_last_at, 'YYYY-MM-DD') AS sout_last_at, created_at, is_test
         FROM companies WHERE id = $1`,
        [req.tenant.companyId]
      ),
      // Ниши компании — нужны и не-владельцу (например, форме визита в
      // Visits.jsx), а весь раздел "Безопасность" (где эти ниши выбираются)
      // owner-only, поэтому список ниш отдаём здесь же, в общедоступной
      // сводке о компании, а не заводим исключение в security.routes.js.
      pool.query(`SELECT niche FROM security_profile_niches WHERE company_id = $1 ORDER BY niche`, [req.tenant.companyId]),
    ]);
    if (companyRes.rows.length === 0) {
      return res.status(404).json({ error: 'Компания не найдена' });
    }
    res.json({ ...companyRes.rows[0], niches: nichesRes.rows.map((r) => r.niche) });
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
