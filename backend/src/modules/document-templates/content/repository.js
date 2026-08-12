// Единственная точка доступа к контенту шаблонов документов — тот же принцип,
// что и в modules/security/content/repository.js: остальной код модуля не
// импортирует content/templates/*.js напрямую, только через функции ниже.
// Задел на будущее тот же — когда шаблоны нужно будет редактировать через
// админку без участия разработчика (например, чтобы юрист сам проставлял
// reviewed), функции здесь меняются на pool.query к таблице шаблонов с тем же
// форматом объектов, вызывающий код не меняется.

const TEMPLATES_BY_NICHE = {
  manicure: [
    require('./templates/manicure'),
    require('./templates/manicure-pd-consent'),
    require('./templates/manicure-pd-distribution'),
    require('./templates/manicure-marketing-consent'),
    require('./templates/manicure-privacy-policy'),
  ],
};

async function getTemplatesForNiche(niche) {
  return TEMPLATES_BY_NICHE[niche] || [];
}

async function getTemplate(key) {
  for (const list of Object.values(TEMPLATES_BY_NICHE)) {
    const found = list.find((t) => t.key === key);
    if (found) return found;
  }
  return null;
}

module.exports = { getTemplatesForNiche, getTemplate };
