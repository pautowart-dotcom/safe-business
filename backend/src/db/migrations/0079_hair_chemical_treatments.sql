-- Флаг "оказывает услуги с химическими составами (кератин, ботокс для волос,
-- сложная химическая завивка)" для ниши "Волосы" — управляет показом
-- отдельного блока вопросов теста безопасности (visibility.js, предикат
-- has_hair_chemical_treatments). NULL/false — блок скрыт, как для всех ниш
-- кроме hair по умолчанию.
ALTER TABLE security_profile_niches ADD COLUMN IF NOT EXISTS chemical_treatments BOOLEAN;
