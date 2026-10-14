-- Год в ключе налоговых сроков (14.10.2026, В1 плана этапа 2). Раньше
-- related_entity_type был `tax:<слот>` без года — в январе пересохранение
-- настроек перезаписывало ещё не наступившие сроки прошлого года (декларация
-- УСН за год, доплата 1%, годовые РСВ/6-НДФЛ) сроками нового. Теперь ключ —
-- `tax:<год>:<слот>` (core/taxDeadlines.js, taxRelatedType).
--
-- Год берём из названия срока: core/taxDeadlines.js всегда пишет в title
-- «за <год>» / «<период> <год>». Строки без года в названии (их быть не
-- должно) не трогаем — их пересоздаст следующее сохранение настроек.
UPDATE deadlines
SET related_entity_type = 'tax:' || substring(title from '(20[0-9]{2})') || ':' || substring(related_entity_type from 5)
WHERE related_entity_type IN (
    'tax:insurance_fixed', 'tax:insurance_extra',
    'tax:usn_q1', 'tax:usn_q2', 'tax:usn_q3', 'tax:usn_annual',
    'tax:emp_q1', 'tax:emp_q2', 'tax:emp_q3', 'tax:emp_annual', 'tax:emp_annual_6ndfl'
  )
  AND title ~ '20[0-9]{2}';
