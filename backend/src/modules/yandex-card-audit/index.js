// Публичная функция движка — без Express, без БД, чтобы её же можно было
// вызвать и из авторизованного роута ЛК позже, без переписывания.
const { fetchCardHtml } = require('./fetchCard');
const { parseCard } = require('./parseCard');
const { runChecklist } = require('./checklist');

async function auditCard(url) {
  const { html, orgId } = await fetchCardHtml(url);
  const fields = parseCard(html, orgId);
  const findings = runChecklist(fields, orgId);
  return { fields, findings };
}

module.exports = { auditCard };
