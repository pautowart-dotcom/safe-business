const pool = require('../../db/pool');
const { verifyToken } = require('../jwt');
const asyncHandler = require('../../utils/asyncHandler');

const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Необходима авторизация' });
  }

  let payload;
  try {
    payload = verifyToken(header.slice('Bearer '.length));
  } catch (err) {
    return res.status(401).json({ error: 'Недействительный или истёкший токен' });
  }

  const { rows } = await pool.query(
    'SELECT id, name, email, phone, is_super_admin, analytics_consent, avatar_url FROM users WHERE id = $1',
    [payload.sub]
  );
  if (rows.length === 0) {
    return res.status(401).json({ error: 'Пользователь не найден' });
  }

  req.user = rows[0];
  req.authSession = payload;
  next();
});

module.exports = { requireAuth };
