-- Новый продукт: платный (1490₽, разово) roadmap открытия бизнеса для тех,
-- кто ещё не открылся. Отдельная воронка от подписки (companies/memberships)
-- — вся эта аудитория анонимна, без аккаунта, доступ по ссылке из письма.

-- Лид пишется на этапе интейка независимо от оплаты (ниша+юрформа или
-- ответы на вопросы "не знаю юрформу" → рекомендация) — так лид не теряется,
-- даже если человек не дошёл до оплаты.
CREATE TABLE IF NOT EXISTS leads (
    id                      SERIAL PRIMARY KEY,
    email                   VARCHAR(150) NOT NULL,
    phone                   VARCHAR(30),
    niche                   VARCHAR(50) NOT NULL,
    legal_form              VARCHAR(20) CHECK (legal_form IN ('self_employed', 'ip', 'ooo')),
    legal_form_recommended  VARCHAR(20) CHECK (legal_form_recommended IN ('self_employed', 'ip', 'ooo')),
    intake_answers          JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);

-- access_token — НЕ хэшируем (в отличие от password_reset_tokens): хэш
-- нельзя развернуть обратно, а вебхуку ЮKassa (см. roadmap.routes.js)
-- нужно самому построить ссылку для письма "roadmap готов" уже после
-- редиректа клиента, не имея под рукой исходный plaintext. Правильный
-- прецедент в этой базе — qr_token у generated_journals (тоже хранится как
-- есть и используется напрямую для лукапа): токен — не пароль и не credential
-- для входа в аккаунт, а bearer-ссылка на купленный PDF, тот же класс риска.
-- Генерируется на checkout (ещё до оплаты) и используется и для поллинга
-- статуса, и как итоговая ссылка на готовый roadmap — так returnUrl ЮKassa и
-- письмо со ссылкой ведут на один и тот же URL.
CREATE TABLE IF NOT EXISTS roadmap_orders (
    id                  SERIAL PRIMARY KEY,
    lead_id             INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    amount_rub          NUMERIC(10,2) NOT NULL,
    yookassa_payment_id VARCHAR(100) UNIQUE,
    access_token        VARCHAR(64) NOT NULL UNIQUE,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'succeeded', 'canceled')),
    checkin_sent_at     TIMESTAMPTZ,
    opened_status       VARCHAR(20) NOT NULL DEFAULT 'unknown'
                        CHECK (opened_status IN ('unknown', 'already_open', 'not_yet')),
    upsell_sent_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_roadmap_orders_lead ON roadmap_orders(lead_id);
CREATE INDEX IF NOT EXISTS idx_roadmap_orders_checkin
    ON roadmap_orders(confirmed_at) WHERE status = 'succeeded' AND checkin_sent_at IS NULL;
