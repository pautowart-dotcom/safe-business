-- Пакет 3, Этап 6: журнал получения/расходования дезсредств формируется
-- автоматически из истории списаний позиций склада, помеченных этим тегом
-- (без отдельного ручного ввода) — см. journals.routes.js GET /disinfectant-log,
-- которая читает supply_movements/supplies напрямую. Это узкий тег под
-- конкретную задачу, не общая система категорий склада (та — отдельная,
-- пока не сделанная правка из Этапа 10 п.2, "работа/бар" и настраиваемые
-- категории — путать их не стоит).
ALTER TABLE supplies ADD COLUMN IF NOT EXISTS is_disinfectant BOOLEAN NOT NULL DEFAULT false;

INSERT INTO journal_types (key, title, disclaimer) VALUES
('disinfectant_log', 'Журнал дезинфицирующих средств', 'Ведётся в информационных целях и не заменяет обязательную печатную версию, предусмотренную законодательством.')
ON CONFLICT (key) DO NOTHING;
