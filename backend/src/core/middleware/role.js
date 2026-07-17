function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.tenant || !roles.includes(req.tenant.role)) {
      return res.status(403).json({ error: 'Недостаточно прав для этого действия' });
    }
    next();
  };
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || !req.user.is_super_admin) {
    return res.status(403).json({ error: 'Недостаточно прав для этого действия' });
  }
  next();
}

module.exports = { requireRole, requireSuperAdmin };
