const jwt = require('jsonwebtoken');

const BASE_EXPIRES_IN = '30d';
// Раньше было 12h: компани-токен — единственный токен, который фронтенд
// шлёт после выбора компании (см. AuthContext.jsx), и при его протухании
// interceptor сразу разлогинивает без попытки обновления (его просто нет) —
// пользователей выкидывало посреди обычного использования. Совпадает с
// base-токеном, пока нет отдельного refresh-flow.
const COMPANY_EXPIRES_IN = '30d';

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
