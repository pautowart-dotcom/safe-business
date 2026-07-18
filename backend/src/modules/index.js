// Единая точка загрузки бизнес-модулей: подключение файла модуля здесь
// регистрирует его в core/modules-registry (side effect require).
// Ядро само модули не ищет — так реестр остаётся явным и предсказуемым.
require('./clients');
require('./visits');
require('./finance');
require('./supplies');
require('./checklists');
require('./knowledge');
require('./security');
require('./feedback');
