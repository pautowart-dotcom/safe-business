// Когорта "только безопасность" (04.09.2026) — компании, зарегистрированные
// после этой даты, получают ТОЛЬКО модули, относящиеся к риску/защите
// (security, checklists, knowledge, feedback, document-templates), а не
// весь бывший набор по умолчанию (finance/supplies/clients/visits/
// ai-assistant). Решение владельца: два реальных сигнала (детская
// танцевальная студия, вендинг кофе) показали, что операционка сбивает с
// толку и не покрыта тестом — новым компаниям её вообще не включаем, а не
// просто прячем в меню (см. frontend/src/utils/cohort.js — та же дата, тот
// же смысл, два файла, потому что бэкенд и фронтенд не делят код).
const NEW_COHORT_CUTOFF = new Date('2026-09-03T00:00:00Z');

// Ниши/риск — единственное, что включено по умолчанию новой когорте.
// document-templates — третий слой ("решение" из теста, шаблоны). ai-assistant
// сознательно исключён — его нынешние инструменты (log_visit/create_expense/
// get_finance_summary) требуют finance/visits, которых у этой когорты нет;
// комплаенс-версию ассистента ещё не построили, включать нечего.
const NEW_COHORT_MODULES = ['security', 'checklists', 'knowledge', 'feedback', 'document-templates'];

function isNewCohortNow() {
  return new Date() >= NEW_COHORT_CUTOFF;
}

module.exports = { NEW_COHORT_CUTOFF, NEW_COHORT_MODULES, isNewCohortNow };
