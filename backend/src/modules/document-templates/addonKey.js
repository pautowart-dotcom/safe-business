// Ключ должен совпадать с записью в core/addons.js (ADDON_CATALOG) — вынесен
// в отдельный файл, чтобы не хардкодить строку 'document_templates' в
// нескольких местах модуля и не тянуть весь core/addons.js туда, где нужен
// только ключ.
module.exports = { ADDON_KEY: 'document_templates' };
