// Требует, чтобы requireAuth уже отработал и заполнил req.authSession.
function requireTenant(req, res, next) {
  if (!req.authSession || req.authSession.session !== 'company') {
    return res.status(401).json({ error: 'Выберите компанию для продолжения' });
  }

  req.tenant = {
    companyId: req.authSession.companyId,
    membershipId: req.authSession.membershipId,
    role: req.authSession.role,
    branchId: req.authSession.branchId || null,
  };
  next();
}

module.exports = { requireTenant };
