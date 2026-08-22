// Общая маска телефона (21.08.2026) — вынесена из PublicLeadForm.jsx, чтобы
// то же самое поведение было и в ручном добавлении заявки (Leads.jsx), а не
// только в публичной форме. Строит "+7 (XXX) XXX-XX-XX" по мере ввода,
// цифры сверх 10 отбрасываются, а не накапливаются.
export function formatPhoneInput(raw) {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('7') || digits.startsWith('8')) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  let out = '+7';
  if (digits.length > 0) out += ` (${digits.slice(0, 3)}`;
  if (digits.length >= 3) out += ')';
  if (digits.length > 3) out += ` ${digits.slice(3, 6)}`;
  if (digits.length > 6) out += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) out += `-${digits.slice(8, 10)}`;
  return out;
}

// onChange-обработчик для контролируемого инпута — общий для формы заявки
// (публичной и внутренней), возвращает новое значение поля.
export function nextPhoneValue(rawInputValue) {
  let digits = rawInputValue.replace(/\D/g, '');
  if (digits.startsWith('7') || digits.startsWith('8')) digits = digits.slice(1);
  return digits.length === 0 ? '' : formatPhoneInput(rawInputValue);
}
