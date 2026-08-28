// Единственная точка доступа к контенту переходов статуса бизнеса — тот же
// принцип, что в modules/security/content/repository.js и
// modules/document-templates/content/repository.js: остальной код не
// импортирует transitions/*.js напрямую. Пока заполнен один переход
// (self_employed_to_ip, Фаза 1) — остальные (ИП→ООО, наём первого
// сотрудника и т.д.) добавляются сюда же новым require без переархитектуры.

const TRANSITIONS = {
  self_employed_to_ip: require('./transitions/selfEmployedToIp'),
};

function getTransition(key) {
  return TRANSITIONS[key] || null;
}

module.exports = { getTransition };
