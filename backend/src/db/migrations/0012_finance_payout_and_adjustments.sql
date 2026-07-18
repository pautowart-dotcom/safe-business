-- Этап 6: модель зарплаты мастера и ручные корректировки.

-- Задел под будущие типы оплаты (за смену, фиксированный оклад и т.д.) —
-- сейчас реализована только процентная модель (payout_percent), но код и
-- схема не должны жёстко предполагать, что оплата всегда процентная.
-- Добавление нового типа позже — это ALTER CHECK constraint плюс ветка в
-- расчёте, без переписывания структуры.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS payout_type VARCHAR(20) NOT NULL DEFAULT 'percent'
    CHECK (payout_type IN ('percent'));

-- Ручные корректировки (премии/вычеты) владельца к конкретному мастеру за
-- период. НЕ считаются системой автоматически — обязательный комментарий.
-- Мастер видит свои корректировки и комментарий в ЛК, редактирует только
-- владелец.
CREATE TABLE IF NOT EXISTS finance_adjustments (
    id                    SERIAL PRIMARY KEY,
    company_id            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    master_membership_id  INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    amount                NUMERIC(10,2) NOT NULL, -- положительная = премия, отрицательная = вычет
    comment               TEXT NOT NULL,
    occurred_at           DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_finance_adjustments_company_date ON finance_adjustments(company_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_finance_adjustments_master ON finance_adjustments(master_membership_id, occurred_at);
