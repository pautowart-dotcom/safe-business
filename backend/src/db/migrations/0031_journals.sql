-- Пакет 3, Этап 5: журналы УФ-бактерицидной установки и инструктажа на
-- рабочем месте.
--
-- journal_types — "структура" журналов (заголовок + обязательный
-- дисклеймер), редактируется через админку Super Admin (как
-- legal_documents), а не зашита в код — чтобы формулировку можно было
-- поправить без релиза. Этап 7 (журналы стерилизации, пока заблокирован
-- в docs/task-batch-3.txt — ждём образцов от владельца) добавится сюда
-- третьей строкой + своей entries-таблицей по той же схеме, без переделки
-- этой части.
CREATE TABLE IF NOT EXISTS journal_types (
    key                VARCHAR(50) PRIMARY KEY,
    title              VARCHAR(200) NOT NULL,
    disclaimer         TEXT NOT NULL,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO journal_types (key, title, disclaimer) VALUES
('uv_lamp', 'Журнал УФ-бактерицидной установки', 'Ведётся в информационных целях и не заменяет обязательную печатную версию, предусмотренную законодательством.'),
('briefing', 'Журнал инструктажа на рабочем месте', 'Ведётся в информационных целях и не заменяет обязательную печатную версию, предусмотренную законодательством.')
ON CONFLICT (key) DO NOTHING;

-- Журнал УФ-лампы: простая форма — включил/выключил, ответственный
-- (любой сотрудник компании, свободный выбор — не привязан к роли), время.
CREATE TABLE IF NOT EXISTS uv_lamp_entries (
    id                 SERIAL PRIMARY KEY,
    company_id         INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    action             VARCHAR(10) NOT NULL CHECK (action IN ('on', 'off')),
    membership_id      INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    occurred_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_uv_lamp_entries_company ON uv_lamp_entries(company_id);

-- Журнал инструктажа: разовое событие — кто провёл + кто получил, оба
-- подтверждают действие отдельно (без эл. подписи, просто "подтверждаю"
-- с меткой времени). *_confirmed_at NULL = ещё не подтверждено.
CREATE TABLE IF NOT EXISTS briefing_entries (
    id                      SERIAL PRIMARY KEY,
    company_id              INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    conductor_membership_id INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    recipient_membership_id INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    topic                   VARCHAR(200),
    conductor_confirmed_at  TIMESTAMPTZ,
    recipient_confirmed_at  TIMESTAMPTZ,
    created_by_user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_briefing_entries_company ON briefing_entries(company_id);
