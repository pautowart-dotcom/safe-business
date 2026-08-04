-- Мультивыбор ниш в сегменте "Красота и здоровье" (маникюр/ресницы-брови/
-- волосы/массаж). security_profiles.niche был singular (1 ниша на компанию) —
-- переносим в M:N таблицу, остальная схема (security_sessions, _violations,
-- _reports, _waitlist) не меняется: каждая сессия теста по-прежнему про одну
-- нишу (см. docs/status после этой миграции), объединение нескольких ниш в
-- один индекс/отчёт считается на лету по последней завершённой сессии каждой
-- сейчас выбранной ниши — не требует новых колонок в security_sessions.

CREATE TABLE IF NOT EXISTS security_profile_niches (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    niche       VARCHAR(50) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, niche)
);
CREATE INDEX IF NOT EXISTS idx_security_profile_niches_company ON security_profile_niches(company_id);

-- Перенос существующих данных: у кого уже была выбрана ниша — переносим как
-- единственную выбранную.
INSERT INTO security_profile_niches (company_id, niche)
SELECT company_id, niche FROM security_profiles WHERE niche IS NOT NULL
ON CONFLICT (company_id, niche) DO NOTHING;

ALTER TABLE security_profiles DROP COLUMN IF EXISTS niche;
