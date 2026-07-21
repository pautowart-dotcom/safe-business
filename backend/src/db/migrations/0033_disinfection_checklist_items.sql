-- Пакет 3, Этап 6: журнал дезинфекции/уборки — не отдельная система, а
-- дополнительные пункты во ВСЕ уже существующие чек-листы открытия/закрытия
-- смены (checklist_items), как и просит задача ("встроить в уже
-- существующий чек-лист, не создавать параллельную систему"). Бэкафилл
-- для шаблонов, уже созданных владельцами; шаблон, который появится позже,
-- владелец дополняет пунктами через обычный UI ("Изменить" -> "+
-- Добавить") — он это уже умеет без каких-либо изменений кода.
-- NOT EXISTS-проверка — чтобы повторный прогон (или повторный деплой) не
-- задублировал пункты.
INSERT INTO checklist_items (company_id, template_id, label, sort_order)
SELECT t.company_id, t.id, 'Обработка рабочих поверхностей дезинфицирующим средством',
       COALESCE((SELECT MAX(sort_order) + 1 FROM checklist_items WHERE template_id = t.id), 0)
FROM checklist_templates t
WHERE t.kind = 'opening'
  AND NOT EXISTS (
    SELECT 1 FROM checklist_items ci
    WHERE ci.template_id = t.id AND ci.label = 'Обработка рабочих поверхностей дезинфицирующим средством'
  );

INSERT INTO checklist_items (company_id, template_id, label, sort_order)
SELECT t.company_id, t.id, 'Проверка наличия дезинфицирующих средств в достаточном количестве',
       COALESCE((SELECT MAX(sort_order) + 1 FROM checklist_items WHERE template_id = t.id), 0)
FROM checklist_templates t
WHERE t.kind = 'opening'
  AND NOT EXISTS (
    SELECT 1 FROM checklist_items ci
    WHERE ci.template_id = t.id AND ci.label = 'Проверка наличия дезинфицирующих средств в достаточном количестве'
  );

INSERT INTO checklist_items (company_id, template_id, label, sort_order)
SELECT t.company_id, t.id, 'Дезинфекция рабочих поверхностей и инструментов после смены',
       COALESCE((SELECT MAX(sort_order) + 1 FROM checklist_items WHERE template_id = t.id), 0)
FROM checklist_templates t
WHERE t.kind = 'closing'
  AND NOT EXISTS (
    SELECT 1 FROM checklist_items ci
    WHERE ci.template_id = t.id AND ci.label = 'Дезинфекция рабочих поверхностей и инструментов после смены'
  );

INSERT INTO checklist_items (company_id, template_id, label, sort_order)
SELECT t.company_id, t.id, 'Уборка помещения (пол, мусор, проветривание)',
       COALESCE((SELECT MAX(sort_order) + 1 FROM checklist_items WHERE template_id = t.id), 0)
FROM checklist_templates t
WHERE t.kind = 'closing'
  AND NOT EXISTS (
    SELECT 1 FROM checklist_items ci
    WHERE ci.template_id = t.id AND ci.label = 'Уборка помещения (пол, мусор, проветривание)'
  );
