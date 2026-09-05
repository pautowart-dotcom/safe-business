// Перенесено в core/profileVisibility.js (05.09.2026) — межмодульная
// сущность, нужна и тесту безопасности, и генерации документов
// (document-templates). Ре-экспорт, чтобы не трогать существующие вызовы
// isVisible/filterVisible/PREDICATES внутри security.
module.exports = require('../../../core/profileVisibility');
