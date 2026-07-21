-- Пакет 3, Этап 2: единый движок сроков/уведомлений. Заменяет прежний
-- недоделанный календарь (calendar_events/calendar.routes.js/Calendar.jsx —
-- баги белого экрана и создания события) новым, более узким разделом
-- "Дедлайны". Таблица calendar_events намеренно не удаляется (не наша
-- задача терять данные), просто больше не используется маршрутами/UI.
--
-- related_entity_type/related_entity_id — необязательная привязка к
-- источнику (например 'staff_document'/membership_id в Этапе 3,
-- 'tax_regime'/company_id в Этапе 4). Уникальный индекс по этой паре +
-- категории — чтобы модуль-поставщик мог просто "обновить" срок (при
-- изменении даты документа), а не плодить дубликаты при каждом вызове.
CREATE TABLE IF NOT EXISTS deadlines (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category            VARCHAR(20) NOT NULL CHECK (category IN ('legal', 'tax', 'financial', 'staff')),
    title               VARCHAR(200) NOT NULL,
    due_date            DATE NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'dismissed')),
    related_entity_type VARCHAR(50),
    related_entity_id   INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deadlines_company_due ON deadlines(company_id, due_date);
CREATE INDEX IF NOT EXISTS idx_deadlines_company_category ON deadlines(company_id, category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deadlines_entity_unique
    ON deadlines(related_entity_type, related_entity_id, category)
    WHERE related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL;

-- Тумблеры по категориям в Настройках. Отсутствие строки трактуется как
-- enabled = true (категория включена по умолчанию) — см. COALESCE в GET
-- /platform/deadlines/settings.
CREATE TABLE IF NOT EXISTS notification_settings (
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category    VARCHAR(20) NOT NULL CHECK (category IN ('legal', 'tax', 'financial', 'staff')),
    enabled     BOOLEAN NOT NULL DEFAULT true,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (company_id, category)
);
