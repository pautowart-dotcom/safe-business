-- Вид проверки подробнее (28.09.2026, владелец: "собирать, какая проверка
-- была"). Плановые проверки малого бизнеса почти не проводятся (мораторий
-- ПП №336 продлён до 2030 года), поэтому "внеплановая" — почти всегда, и
-- сама по себе мало что говорит. Важнее ПРИЧИНА: жалоба клиента или
-- профилактический визит (отдельное мероприятие по 248-ФЗ, без штрафа).
-- Старое значение 'unplanned' остаётся валидным для уже внесённых записей
-- ("внеплановая, причина не указана").
ALTER TABLE inspections DROP CONSTRAINT IF EXISTS inspections_kind_check;
ALTER TABLE inspections ADD CONSTRAINT inspections_kind_check
  CHECK (kind IN ('planned', 'unplanned', 'unplanned_complaint', 'preventive_visit', 'unknown'));
