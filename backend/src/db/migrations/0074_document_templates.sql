-- Шаблоны документов (12.08.2026) — генерация документов из шаблонов,
-- заполненных данными бизнеса. Сами шаблоны (текст, версия, статус
-- draft/reviewed, кем проверен, норма закона) НЕ хранятся в БД — это
-- контент-файлы в modules/document-templates/content/templates/, тот же
-- принцип, что и у контента модуля security (см. content/repository.js там:
-- "осознанный задел на будущее... когда понадобится редактирование через
-- админку без участия разработчика"). В БД — только то, что реально
-- динамическое: факт генерации конкретного документа конкретной компанией.
--
-- Реквизиты компании (ИНН, юр.адрес, ФИО) сознательно НЕ хранятся отдельным
-- профилем — отдельная категория ПДн, лишний риск поверх уже открытых
-- вопросов приватности. Клиент вводит их в форму перед каждой генерацией,
-- значения попадают только в data_enc конкретного документа (аудиторский
-- след "на основе каких данных" — требование продукта), не в переиспользуемую
-- запись. Шифруется тем же способом, что security_answers (core/crypto.js).
--
-- template_version/template_title/template_status_at_generation/
-- law_reference_at_generation — снимок на момент генерации, а не ссылка на
-- живой контент-файл: если шаблон потом обновится новой версией или его
-- статус сменится на reviewed, уже выданный клиенту документ должен
-- продолжать честно показывать, каким он был на момент выдачи.
CREATE TABLE IF NOT EXISTS generated_documents (
    id                              SERIAL PRIMARY KEY,
    company_id                      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    template_key                    VARCHAR(80) NOT NULL,
    template_version                INTEGER NOT NULL,
    template_title                  VARCHAR(200) NOT NULL,
    template_status_at_generation   VARCHAR(20) NOT NULL CHECK (template_status_at_generation IN ('draft', 'reviewed')),
    law_reference_at_generation     TEXT,
    data_enc                        BYTEA NOT NULL,
    file_url                        VARCHAR(500) NOT NULL,
    generated_by_user_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    generated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_generated_documents_company ON generated_documents(company_id);
