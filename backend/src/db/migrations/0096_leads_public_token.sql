-- Публичная ссылка приёма заявок без входа в систему (20.08.2026) — токен
-- лениво генерируется при первом запросе владельцем (GET
-- /platform/leads-public/token), см. leads-public.routes.js. Тот же уровень
-- защиты, что у qr_token печатных журналов (generated_journals) — 32 случайных
-- hex-символа, непредсказуемо, отдельная капча не нужна.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS leads_public_token VARCHAR(32) UNIQUE;
