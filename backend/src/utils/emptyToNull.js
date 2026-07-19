// Формы шлют необязательные числовые/булевы поля как '' (пустая строка), а
// не null, когда очищены. `value ?? null` это не ловит ('' не является
// null/undefined), и '' долетает до параметра запроса — для integer/numeric
// колонок Postgres падает с ошибкой приведения типа ("invalid input syntax
// for type integer", pg_strtoint32_safe). Использовать вместо `value ?? null`
// в UPDATE ... SET col = COALESCE($n, col) для необязательных полей.
module.exports = function emptyToNull(value) {
  return value === '' || value === undefined ? null : value;
};
