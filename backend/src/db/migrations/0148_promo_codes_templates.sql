-- Промокоды на документы (20.10.2026): applies_to = 'templates' уже был
-- заложен в 0128, но в оплате документов не применялся. Скидка хранится у
-- покупки — лимит использований и статистика в админке считают и её.
ALTER TABLE addon_purchases ADD COLUMN IF NOT EXISTS promo_code_id INTEGER REFERENCES promo_codes(id);
ALTER TABLE addon_purchases ADD COLUMN IF NOT EXISTS discount_rub INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_addon_purchases_promo ON addon_purchases(promo_code_id) WHERE promo_code_id IS NOT NULL;
