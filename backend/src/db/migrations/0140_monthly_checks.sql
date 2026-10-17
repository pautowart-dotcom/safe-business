-- Проверка месяца (17.10.2026, docs/franchise-funkcional.md §11, этап 7).
-- Раз в месяц точка отвечает на 5–7 коротких вопросов, собранных из её же
-- данных (открытые нарушения, сроки месяца, задачи сети) и пары регулярных
-- вещей. Ответы сразу закрывают нарушения/сроки/задачи; итог — «стало
-- лучше / горит / план на месяц». items — вопросы с ответами (JSONB), чтобы
-- итог за прошлый месяц оставался таким, каким был.
CREATE TABLE IF NOT EXISTS monthly_checks (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    month               VARCHAR(7) NOT NULL,
    items               JSONB NOT NULL,
    index_percent       INTEGER,
    completed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (company_id, month)
);
