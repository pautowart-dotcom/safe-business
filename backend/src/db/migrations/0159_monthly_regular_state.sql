-- Подписка без дат (26.10.2026, docs/plan-2026-10-26.md, шаг 1). Регулярные
-- вопросы «Проверки месяца» идут со своей частотой (журналы — каждый месяц,
-- огнетушители — раз в квартал, инструктаж — раз в полгода…). Ответ «да»
-- запускает цикл: last_done = дата ответа или дата, которую человек по желанию
-- указал сам («когда было»). every_months — своя частота, если владелец её
-- поменял (огнетушители после перезарядки); NULL — частота по умолчанию.
CREATE TABLE IF NOT EXISTS monthly_regular_state (
    company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    item_key      VARCHAR(40) NOT NULL,
    last_done     DATE,
    every_months  INTEGER CHECK (every_months IS NULL OR every_months BETWEEN 1 AND 24),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (company_id, item_key)
);
