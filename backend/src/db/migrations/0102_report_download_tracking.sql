-- Трекинг скачивания PDF-отчёта (21.08.2026, владелец: "пометка PDF скачан
-- такого-то числа" — нужна для решений по возвратам, см. оферту §3.4(в):
-- если PDF уже скачан, услуга за период считается оказанной). Не трогает
-- сам PDF/его содержимое — только факт и время скачивания.
ALTER TABLE security_reports ADD COLUMN IF NOT EXISTS first_downloaded_at TIMESTAMPTZ;
ALTER TABLE security_reports ADD COLUMN IF NOT EXISTS download_count INTEGER NOT NULL DEFAULT 0;
