-- Флаг "свои" компании — бесплатный доступ ко всем платным надстройкам
-- (обкатка новых платных функций на собственных студиях владельца до
-- открытия продажи остальным). Общий для всех будущих addon, не только
-- ИИ-советника по марже — см. core/middleware/addon.js.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS free_addons BOOLEAN NOT NULL DEFAULT false;

-- 18.08.2026: владелец назвал email, под которым заведены обе его студии
-- (gromakovaek0206@gmail.com) — включаем флаг обеим компаниям, где этот
-- пользователь состоит в роли owner. Если email сменится или добавится
-- третья студия — это переприменится само при повторном запуске (WHERE
-- находит по текущему состоянию users/memberships, а не по одноразовому
-- списку id).
UPDATE companies SET free_addons = true
WHERE id IN (
  SELECT m.company_id FROM memberships m
  JOIN users u ON u.id = m.user_id
  WHERE u.email = 'gromakovaek0206@gmail.com' AND m.role = 'owner'
);
