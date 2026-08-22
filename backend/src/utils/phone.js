// Общая нормализация телефона для заявок/клиентов (21.08.2026) — раньше
// каждое место (публичная форма, ручное добавление) валидировало по-своему
// или вообще никак, из-за чего сопоставление "тот же человек" по номеру
// было ненадёжным. Возвращает +7XXXXXXXXXX или null, если не похоже на
// российский номер (ровно 10 цифр после отброшенного кода страны).
function normalizeRuPhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('7') || digits.startsWith('8')) digits = digits.slice(1);
  if (!/^\d{10}$/.test(digits)) return null;
  return `+7${digits}`;
}

module.exports = { normalizeRuPhone };
