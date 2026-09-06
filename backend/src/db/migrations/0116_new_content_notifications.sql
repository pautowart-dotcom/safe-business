-- Уведомления о новых пунктах теста для уже вовлечённых компаний
-- (06.09.2026, вопрос владельца: "как быть клиенту, который уже всё
-- купил?" — когда мы добавляем новый вопрос/нарушение в матрицу, компании,
-- уже проходившие тест, никак об этом не узнают, пока сами не откроют
-- раздел заново). Таблица хранит, о каком именно коде уже уведомили
-- компанию — без неё scripts/newFindingsNotifier.js слал бы push повторно
-- каждый день, пока владелец не ответит на новый вопрос.
CREATE TABLE IF NOT EXISTS new_content_notifications (
    id             BIGSERIAL PRIMARY KEY,
    company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    question_code  VARCHAR(30) NOT NULL,
    notified_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, question_code)
);
