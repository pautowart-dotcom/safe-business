-- Пакет 2, Этап 7: чтобы блок "Внимание сегодня" мог показать статус смены
-- (открыта/закрыта), нужно знать, какой из произвольно называемых
-- чек-листов владельца — это открытие, а какой закрытие смены. Раньше
-- шаблоны никак не размечались (просто список с любым названием).
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS kind VARCHAR(20);
ALTER TABLE checklist_templates DROP CONSTRAINT IF EXISTS checklist_templates_kind_check;
ALTER TABLE checklist_templates ADD CONSTRAINT checklist_templates_kind_check
    CHECK (kind IN ('opening', 'closing') OR kind IS NULL);
