const pool = require('../../db/pool');
const { verifyToken } = require('../jwt');
const { signFileUrl } = require('../fileStorage');
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
    'SELECT id, name, email, phone, is_super_admin, analytics_consent, avatar_url, onboarding_seen_at, password_changed_at FROM users WHERE id = $1',
    [payload.sub]
  );
  if (rows.length === 0) {
    return res.status(401).json({ error: 'Пользователь не найден' });
  }

  // Аудит безопасности 29.07.2026: токены живут до 30 дней (core/jwt.js) —
  // без этой проверки токен, выданный ДО сброса пароля, продолжал бы
  // работать после него вплоть до истечения срока. payload.iat — секунды,
  // password_changed_at — дата; сравниваем в одних единицах.
  const user = rows[0];
  if (user.password_changed_at && payload.iat * 1000 < new Date(user.password_changed_at).getTime()) {
    return res.status(401).json({ error: 'Пароль был изменён — войдите заново' });
  }
  delete user.password_changed_at;
  // Аудит безопасности 29.07.2026 подписал ссылки на визитные фото/документы
  // короткоживущей подписью, но аватар тогда сознательно не тронули (низкая
  // чувствительность) — а сама раздача /api/uploads стала требовать подпись
  // у ЛЮБОГО файла без исключений. С тех пор аватар отдавался неподписанной
  // ссылкой, которую сервер сам же отклонял: битая картинка вместо фото в
  // личном кабинете. req.user проходит буквально через каждый авторизованный
  // запрос — самое надёжное единое место починить это разом.
  if (user.avatar_url) user.avatar_url = signFileUrl(user.avatar_url);

  req.user = user;
  req.authSession = payload;
  next();
});

module.exports = { requireAuth };
