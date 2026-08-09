-- Обсуждение 09.08.2026, два независимых пункта.

-- 1. Пометка тестовых компаний — чтобы статистика в кабинете платформы
-- (/admin/metrics, /admin/analytics, /admin/sellable-stats) не искажалась
-- тестовыми аккаунтами. Смоук-тест-компания (industry_segment='__smoke_test__',
-- seedSmokeTest.js) помечена автоматически задним числом; остальные "ручные"
-- тестовые студии владельца отличить от реальных нечем — их владелец
-- помечает сам в списке компаний (PATCH /admin/companies/:id/test-flag).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
UPDATE companies SET is_test = true WHERE industry_segment = '__smoke_test__';

-- 2. Push-подписки Super Admin на платформенные события (регистрация новой
-- компании / успешная оплата / новое обращение в поддержку) — отдельная
-- таблица от push_subscriptions (та per-company, membership_id NOT NULL и
-- ON DELETE CASCADE от memberships, тут просто подписка конкретного
-- пользователя-суперадмина, компании тут нет вообще).
CREATE TABLE IF NOT EXISTS admin_push_subscriptions (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
