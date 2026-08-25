const pool = require('../../db/pool');
const asyncHandler = require('../../utils/asyncHandler');

// С 27.07.2026 бесплатного пользования после триала больше нет — компания,
// зарегистрированная ПОСЛЕ этой даты, теряет доступ к платформе, если триал
// истёк, а оплаты не было. Компании старше этой даты (в т.ч. текущие
// тестовые) намеренно не трогаем — таково было решение владельца, чтобы не
// сломать то, чем уже пользуются, без отдельного разговора о каждой из них.
const HARD_TRIAL_CUTOFF = new Date('2026-07-27T00:00:00Z');

// Пути, которые обязаны оставаться доступны даже закрытой компании — иначе
// не из чего будет оформить подписку и не откуда узнать её статус.
const EXEMPT_PATH_PREFIXES = ['/api/platform/companies/current', '/api/platform/subscription'];

function isExempt(req) {
  return EXEMPT_PATH_PREFIXES.some((p) => req.originalUrl.startsWith(p));
}

// Требует, чтобы requireAuth уже отработал и заполнил req.authSession.
const requireTenant = asyncHandler(async (req, res, next) => {
  if (!req.authSession || req.authSession.session !== 'company') {
    return res.status(401).json({ error: 'Выберите компанию для продолжения' });
  }

  // Аудит безопасности 29.07.2026: компани-токен живёт до 30 дней
  // (core/jwt.js) и раньше req.tenant заполнялся целиком из его подписи —
  // уволенный сотрудник (удалённое членство) или смена роли владельцем
  // продолжали действовать до истечения токена, а не сразу. Теперь
  // членство и роль перепроверяются по факту на каждый запрос.
  // С 0060_membership_deactivation.sql увольнение — это active=false, а не
  // DELETE (визиты уволенного мастера нельзя терять — ON DELETE RESTRICT в
  // 0003_visits.sql), так что active тоже обязателен в этом условии, иначе
  // уволенный сохранит доступ до истечения токена, как и было до фикса выше.
  const membershipRes = await pool.query(
    `SELECT role, branch_id FROM memberships
     WHERE id = $1 AND company_id = $2 AND user_id = $3 AND invite_status = 'active' AND active = true`,
    [req.authSession.membershipId, req.authSession.companyId, req.authSession.sub]
  );
  if (membershipRes.rows.length === 0) {
    return res.status(401).json({ error: 'Доступ к этой компании больше недоступен — войдите заново' });
  }

  req.tenant = {
    companyId: req.authSession.companyId,
    membershipId: req.authSession.membershipId,
    role: membershipRes.rows[0].role,
    branchId: membershipRes.rows[0].branch_id || null,
  };

  if (!isExempt(req)) {
    const { rows } = await pool.query(
      'SELECT subscription_status, trial_ends_at, created_at FROM companies WHERE id = $1',
      [req.tenant.companyId]
    );
    const company = rows[0];
    const trialExpired = company?.subscription_status === 'trial' && company.trial_ends_at && new Date(company.trial_ends_at) < new Date();
    if (company && company.created_at >= HARD_TRIAL_CUTOFF && trialExpired) {
      return res.status(402).json({
        error: 'Бесплатный период закончился. Оформите подписку, чтобы продолжить пользоваться платформой.',
        requiresSubscription: true,
      });
    }
  }

  next();
});

module.exports = { requireTenant, HARD_TRIAL_CUTOFF };
