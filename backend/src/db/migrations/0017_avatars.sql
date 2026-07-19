-- Пакет 2, Этап 7: фото пользователя/лого компании в круге личного кабинета.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
