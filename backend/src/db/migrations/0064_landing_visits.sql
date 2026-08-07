-- Анонимный счётчик визитов лендинга (обсуждение 07.08.2026) — сознательно
-- без IP/user-agent/cookies: только факт визита + необязательные UTM-метки
-- из ссылки. Решили не подключать Яндекс.Метрику именно из-за этого — сайт
-- с куки/IP становится обработкой персональных данных стороннего сервиса,
-- что могло потребовать доп.уведомление в РКН, а политика конфиденциальности
-- ещё не прошла ревью юриста. Раз тут нет данных, по которым можно узнать
-- человека — это не персональные данные, вопрос снят целиком.
CREATE TABLE IF NOT EXISTS landing_visits (
    id           SERIAL PRIMARY KEY,
    utm_source   VARCHAR(200),
    utm_medium   VARCHAR(200),
    utm_campaign VARCHAR(200),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_landing_visits_created ON landing_visits(created_at DESC);
