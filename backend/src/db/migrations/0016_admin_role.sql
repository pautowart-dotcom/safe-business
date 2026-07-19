-- Пакет 2, Этап 5: роль "Администратор" — отдельная от owner/master.
-- Права по коду (requireRole/requireTenant), тут только разрешаем
-- значение в проверке на уровне БД.
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check CHECK (role IN ('owner', 'master', 'admin'));
