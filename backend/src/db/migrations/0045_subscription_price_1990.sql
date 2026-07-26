-- Цена подписки поднята с 1490 до 1990 ₽/мес — до первых платящих клиентов,
-- чтобы не пришлось резко повышать цену уже оплатившим (см. также лендинг,
-- где 2500 ₽ — отдельный вопрос синхронизации текстов, не цена в коде).
ALTER TABLE companies ALTER COLUMN subscription_price_rub SET DEFAULT 1990;
UPDATE companies SET subscription_price_rub = 1990 WHERE subscription_price_rub = 1490;
