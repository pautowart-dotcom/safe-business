-- Соло-владелец (без сотрудников) физически не мог завести ни одного визита:
-- master_membership_id/master_payout_percent были NOT NULL, а "мастер" — это
-- только участник с role='master', которой у самого владельца нет и не
-- может появиться без отдельного приглашения самого себя как сотрудника.
-- finance_entries.membership_id уже давно nullable для того же случая
-- ("ручная запись может быть без привязки", 0027_finance_entries.sql) —
-- просто выравниваем visits под ту же модель: визит без мастера — это
-- просто собственная выручка владельца, без строки "выплата мастеру".
ALTER TABLE visits ALTER COLUMN master_membership_id DROP NOT NULL;
ALTER TABLE visits ALTER COLUMN master_payout_percent DROP NOT NULL;
