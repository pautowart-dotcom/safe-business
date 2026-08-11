-- Франшизы (тихая обкатка, 11.08.2026) — франшиза принадлежит КОМПАНИИ, не
-- пользователю: "свой аккаунт" у владельца франшизы — это его обычный
-- владельческий аккаунт компании, без нового типа сессии/входа. Каждая
-- точка-партнёр остаётся полностью независимой компанией/подпиской (та же
-- модель, что закрепилась после отказа от "филиалов" 24.07.2026) — франшиза
-- лишь необязательная read-only связь поверх.

CREATE TABLE IF NOT EXISTS franchise_groups (
    id                SERIAL PRIMARY KEY,
    name              VARCHAR(150) NOT NULL,
    owner_company_id  INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
    join_code         VARCHAR(16) NOT NULL UNIQUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Партнёр подаёт заявку сам (по join_code, полученному от франшизера вне
-- продукта) — franchise.routes.js. Не ручная привязка через /office.
CREATE TABLE IF NOT EXISTS franchise_join_requests (
    id                     SERIAL PRIMARY KEY,
    franchise_group_id     INTEGER NOT NULL REFERENCES franchise_groups(id) ON DELETE CASCADE,
    requesting_company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    status                 VARCHAR(20) NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at             TIMESTAMPTZ
);
-- Не даёт подать вторую заявку, пока первая не рассмотрена.
CREATE UNIQUE INDEX IF NOT EXISTS idx_franchise_join_pending
    ON franchise_join_requests(requesting_company_id) WHERE status = 'pending';

-- Проставляется только при одобрении заявки (PATCH .../join-requests/:id).
-- NULL = точка ни в одной франшизе.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS franchise_group_id
    INTEGER REFERENCES franchise_groups(id) ON DELETE SET NULL;
