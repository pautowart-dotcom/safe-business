-- Комплаенс-чек-лист для самой компании "Безопасный бизнес" (24.08.2026,
-- владелец: "мне нужен свой Без.Бизнес внутри админки") — приватная страница
-- в /office для Super Admin, не публичная ниша теста. Не привязано к
-- companies (это не про клиента, а про саму платформу), поэтому без
-- company_id — один общий набор отметок на всю систему.
CREATE TABLE IF NOT EXISTS platform_compliance_checks (
  code TEXT PRIMARY KEY,
  checked BOOLEAN NOT NULL DEFAULT false,
  checked_at TIMESTAMPTZ,
  checked_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note TEXT
);
