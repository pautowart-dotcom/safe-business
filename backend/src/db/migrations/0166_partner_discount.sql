-- Скидка партнёра (20.11.2026) вычитается из его 30%, не из доли сервиса.
-- 0 — скидки нет, 30 — покупатель платит 70%, партнёру с этой оплаты 0.

ALTER TABLE partner_profiles
  ADD COLUMN IF NOT EXISTS discount_percent INTEGER NOT NULL DEFAULT 0;

ALTER TABLE partner_profiles DROP CONSTRAINT IF EXISTS partner_profiles_discount_percent_check;
ALTER TABLE partner_profiles
  ADD CONSTRAINT partner_profiles_discount_percent_check
  CHECK (discount_percent BETWEEN 0 AND 30);

-- Полная скидка оставляет партнёру 0 ₽, оплата всё равно считается.
ALTER TABLE partner_accruals DROP CONSTRAINT IF EXISTS partner_accruals_share_rub_check;
ALTER TABLE partner_accruals
  ADD CONSTRAINT partner_accruals_share_rub_check CHECK (share_rub >= 0);

-- Доля фиксируется в момент оплаты, чтобы смена процента потом не пересчитала старый платёж.
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS partner_share_rub INTEGER;
ALTER TABLE addon_purchases ADD COLUMN IF NOT EXISTS partner_share_rub INTEGER;
