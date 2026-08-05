-- Скидка на визите раньше была только в процентах. discount_fixed_amount —
-- альтернатива в рублях, взаимоисключающая с discount_percent: если задана
-- (не NULL), она и определяет итоговую сумму, discount_percent в этом
-- случае игнорируется на уровне формулы (COALESCE), а не обнуляется, чтобы
-- при переключении обратно на "%" в форме не терять ранее введённое число.
ALTER TABLE visits ADD COLUMN IF NOT EXISTS discount_fixed_amount NUMERIC(10,2) CHECK (discount_fixed_amount >= 0);
