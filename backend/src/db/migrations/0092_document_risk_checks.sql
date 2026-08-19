-- Проверка внешних документов (договор аренды, с поставщиком, трудовой и
-- т.п.) на риски (19.08.2026, п.6 плана, часть B — владелец: "делал бы всё
-- и потом проверял"). Текст документа хранится зашифрованным (тот же
-- принцип, что generated_documents.data_enc, миграция 0074/core/crypto.js)
-- — загруженный контракт может содержать персональные данные (ФИО, оклад
-- сотрудника, паспортные данные арендодателя и т.п.).
--
-- risk_analysis — вывод ИИ, тоже зашифрован: может пересказывать/цитировать
-- фрагменты того же текста. Явно НЕ юридическая консультация — статус
-- этого предупреждён и на бэкенде (system-промпт), и на фронте (та же
-- дисциплина, что у "бета"-шаблонов документов).
CREATE TABLE IF NOT EXISTS document_risk_checks (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    original_filename   VARCHAR(255) NOT NULL,
    document_type       VARCHAR(50) NOT NULL,
    file_url            VARCHAR(255),
    extracted_text_enc  BYTEA NOT NULL,
    risk_analysis_enc   BYTEA,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
    error_message       TEXT,
    created_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_risk_checks_company ON document_risk_checks(company_id);
