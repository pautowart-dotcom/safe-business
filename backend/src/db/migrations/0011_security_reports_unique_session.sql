-- Баг: POST /sessions/:id/report создавал новую строку при каждом клике на
-- "Скачать PDF" для уже сгенерированного отчёта, с report_number, зависящим
-- от даты + session_id — второй клик в тот же день падал с "duplicate key
-- value violates unique constraint security_reports_report_number_key".
-- Отчёт детерминирован (собирается из session+violations), поэтому у сессии
-- не может быть больше одного отчёта — закрепляем это ограничением на уровне
-- схемы. Если в данных уже есть дубли на session_id — оставляем самый ранний.
DELETE FROM security_reports a
  USING security_reports b
  WHERE a.session_id = b.session_id AND a.id > b.id;

ALTER TABLE security_reports ADD CONSTRAINT security_reports_session_id_key UNIQUE (session_id);
