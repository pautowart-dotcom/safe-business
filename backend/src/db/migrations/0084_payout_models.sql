-- Модели оплаты мастера (15.08.2026) — раньше система умела только "% от
-- чека" (visits.master_payout_percent), а массаж и подобные услуги часто
-- платятся фиксированной суммой за визит, а не процентом, плюс встречается
-- оплата "за выход" (фикс за смену, не зависит от числа клиентов вообще).
--
-- Уровни: тип оплаты по умолчанию — на мастере (memberships.payout_type);
-- необязательное переопределение — на конкретной услуге в каталоге
-- (services.payout_type), тот же паттерн "дефолт + переопределение", что
-- уже применён для рабочих часов (0082_working_hours.sql). "shift" на
-- услуге не бывает осознанно — оплата за смену не привязана к визиту.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS payout_type VARCHAR(10) NOT NULL DEFAULT 'percent'
    CHECK (payout_type IN ('percent', 'fixed', 'shift'));
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS payout_fixed_amount NUMERIC(10,2);
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS shift_payout_amount NUMERIC(10,2);

ALTER TABLE services ADD COLUMN IF NOT EXISTS payout_type VARCHAR(10)
    CHECK (payout_type IN ('percent', 'fixed'));
ALTER TABLE services ADD COLUMN IF NOT EXISTS payout_percent NUMERIC(5,2);
ALTER TABLE services ADD COLUMN IF NOT EXISTS payout_fixed_amount NUMERIC(10,2);

-- Заработок мастера за визит теперь СЧИТАЕТСЯ ОДИН РАЗ на сервере при
-- создании/правке визита и хранится здесь (visits.routes.js,
-- resolveMasterPayout) — а не пересчитывается формулой amount*percent/100
-- при каждом чтении. Иначе фиксированную оплату и оплату за смену
-- некуда было бы встроить без дублирования трёх формул во всех местах,
-- где сейчас читается зарплата (Финансы: сводка/по мастерам/тренды).
-- Бэкафилл — по старой формуле для существующих визитов, чтобы история
-- не сдвинулась ни на копейку при миграции.
ALTER TABLE visits ADD COLUMN IF NOT EXISTS master_payout_amount NUMERIC(10,2);
UPDATE visits SET master_payout_amount = ROUND(amount * master_payout_percent / 100, 2)
    WHERE master_payout_amount IS NULL AND master_payout_percent IS NOT NULL;

-- Учёт смен — только для оплаты "за выход", отдельная явная сущность, не
-- переиспользует чек-лист открытия смены (санитарный, не про деньги;
-- мастер может забыть отметить его и всё равно принять клиентов, или
-- наоборот) — платёжный учёт должен быть explicit, не выведен из другого
-- процесса.
CREATE TABLE IF NOT EXISTS master_shifts (
    id                    SERIAL PRIMARY KEY,
    company_id            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    master_membership_id  INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    shift_date            DATE NOT NULL,
    payout_amount         NUMERIC(10,2) NOT NULL CHECK (payout_amount >= 0),
    created_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (master_membership_id, shift_date)
);
CREATE INDEX IF NOT EXISTS idx_master_shifts_company_date ON master_shifts(company_id, shift_date);
