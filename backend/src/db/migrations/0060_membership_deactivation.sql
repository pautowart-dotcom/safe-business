-- Мастера/админа нельзя удалить, если на него есть визиты (visits.master_membership_id
-- ON DELETE RESTRICT, 0003_visits.sql) — и это правильно, финансовую историю терять
-- нельзя. Раньше это просто ломало запрос грубой ошибкой. Заменяем удаление на
-- деактивацию: участник перестаёт логиниться и предлагаться в пикерах, но его
-- визиты/выплаты/история остаются как есть.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
