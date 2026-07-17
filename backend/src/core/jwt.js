const jwt = require('jsonwebtoken');

const BASE_EXPIRES_IN = '30d';
const COMPANY_EXPIRES_IN = '12h';

function signBaseToken(userId) {
  return jwt.sign({ sub: userId, session: 'base' }, process.env.JWT_SECRET, {
    expiresIn: BASE_EXPIRES_IN,
  });
}

function signCompanyToken({ userId, companyId, membershipId, role, branchId }) {
  return jwt.sign(
    { sub: userId, session: 'company', companyId, membershipId, role, branchId: branchId || null },
    process.env.JWT_SECRET,
    { expiresIn: COMPANY_EXPIRES_IN }
  );
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signBaseToken, signCompanyToken, verifyToken };
