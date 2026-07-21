-- Пакет 3, Этап 3: сроки документов сотрудника (мед. книжка, сертификаты).
-- Несколько строк на одного сотрудника — мед. книжка и произвольное число
-- сертификатов, каждый со своим сроком истечения. title — для сертификата
-- (например "Сертификат мастера маникюра"), для мед. книжки не нужен.
CREATE TABLE IF NOT EXISTS staff_documents (
    id                 SERIAL PRIMARY KEY,
    company_id         INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    membership_id      INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    doc_type           VARCHAR(30) NOT NULL CHECK (doc_type IN ('medical_book', 'certificate')),
    title              VARCHAR(200),
    expires_at         DATE NOT NULL,
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_documents_membership ON staff_documents(membership_id);
CREATE INDEX IF NOT EXISTS idx_staff_documents_company ON staff_documents(company_id);
