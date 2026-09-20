-- История проверок (19.09.2026, идея владельца) — какие проверки у компании
-- уже были, кто приходил, что проверял, чем закончилось. Это и личная
-- память компании (ничего не теряется между проверками), и потенциально
-- самая ценная часть данных продукта: по обезличенной выборке когда-нибудь
-- можно будет сказать "что чаще всего проверяют у таких же студий" — но
-- ТОЛЬКО с согласия на аналитику (companies.analytics_consent), сейчас
-- никакой агрегации нет, только хранение для самой компании.
--
-- Структурные поля (орган, вид, области проверки, итог, сумма штрафа) —
-- открытым текстом: они нужны для будущих сравнений и не содержат
-- описаний. Свободный текст владельца ("что спрашивали, что сказали") —
-- шифруется тем же способом, что security_answers/document_risk_checks
-- (core/crypto.js), там могут оказаться имена и подробности проверки.
--
-- authority — те же ключи, что в security/content/inspectionGuides.js
-- (пять органов с инструкциями) плюс 'other' (прокуратура, полиция и т.д.).
-- areas — фиксированный список областей (см. INSPECTION_AREAS в
-- inspections.routes.js), не свободный текст, чтобы потом их можно было
-- сравнивать между компаниями.
CREATE TABLE IF NOT EXISTS inspections (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    inspected_on        DATE NOT NULL,
    authority           VARCHAR(30) NOT NULL
                        CHECK (authority IN ('rospotrebnadzor', 'fire_inspection', 'labor_inspection', 'roskomnadzor', 'tax_inspection', 'other')),
    kind                VARCHAR(20) NOT NULL DEFAULT 'unknown'
                        CHECK (kind IN ('planned', 'unplanned', 'unknown')),
    areas               TEXT[] NOT NULL DEFAULT '{}',
    outcome             VARCHAR(30) NOT NULL
                        CHECK (outcome IN ('no_findings', 'remarks_fixed', 'order', 'protocol', 'suspension')),
    fine_amount         NUMERIC(12, 2) CHECK (fine_amount IS NULL OR fine_amount >= 0),
    fix_due_date        DATE,
    details_enc         BYTEA,
    created_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inspections_company ON inspections(company_id, inspected_on DESC);
