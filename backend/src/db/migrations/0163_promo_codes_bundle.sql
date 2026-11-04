-- Отдельный промокод на набор «заключение + документы». Скидка такого кода
-- рассчитывается от цены всего набора, существующие типы кодов сохраняются.
ALTER TABLE promo_codes DROP CONSTRAINT IF EXISTS promo_codes_applies_to_check;
ALTER TABLE promo_codes
  ADD CONSTRAINT promo_codes_applies_to_check
  CHECK (applies_to IN ('subscription', 'report', 'templates', 'bundle'));
