// Единственная точка доступа к контенту шаблонов документов — тот же принцип,
// что и в modules/security/content/repository.js: остальной код модуля не
// импортирует content/templates/*.js напрямую, только через функции ниже.
// Задел на будущее тот же — когда шаблоны нужно будет редактировать через
// админку без участия разработчика (например, чтобы юрист сам проставлял
// reviewed), функции здесь меняются на pool.query к таблице шаблонов с тем же
// форматом объектов, вызывающий код не меняется.

// Расширено с 1 на 9 ниш (29.08.2026, решение владельца — "ширина": те же
// 5 типов документов на все ниши с готовым тестом, а не больше типов
// документов под одну нишу). Оферта и политика адаптированы под специфику
// каждой ниши (услуги/гигиена/противопоказания для бьюти-ниш, доступ на
// объект/порча имущества для клининга — см. комментарии в
// templates/cleaning-basic.js), три согласия — общий текст, не зависящий
// от вида услуг. Все status: 'draft', как и исходный пилот.
const TEMPLATES_BY_NICHE = {
  manicure: [
    require('./templates/manicure'),
    require('./templates/manicure-pd-consent'),
    require('./templates/manicure-pd-distribution'),
    require('./templates/manicure-marketing-consent'),
    require('./templates/manicure-privacy-policy'),
  ],
  lashes_brows: [
    require('./templates/lashes-brows'),
    require('./templates/lashes-brows-pd-consent'),
    require('./templates/lashes-brows-pd-distribution'),
    require('./templates/lashes-brows-marketing-consent'),
    require('./templates/lashes-brows-privacy-policy'),
  ],
  hair: [
    require('./templates/hair'),
    require('./templates/hair-pd-consent'),
    require('./templates/hair-pd-distribution'),
    require('./templates/hair-marketing-consent'),
    require('./templates/hair-privacy-policy'),
  ],
  massage: [
    require('./templates/massage'),
    require('./templates/massage-pd-consent'),
    require('./templates/massage-pd-distribution'),
    require('./templates/massage-marketing-consent'),
    require('./templates/massage-privacy-policy'),
  ],
  tattoo: [
    require('./templates/tattoo'),
    require('./templates/tattoo-pd-consent'),
    require('./templates/tattoo-pd-distribution'),
    require('./templates/tattoo-marketing-consent'),
    require('./templates/tattoo-privacy-policy'),
  ],
  depilation: [
    require('./templates/depilation'),
    require('./templates/depilation-pd-consent'),
    require('./templates/depilation-pd-distribution'),
    require('./templates/depilation-marketing-consent'),
    require('./templates/depilation-privacy-policy'),
  ],
  solarium: [
    require('./templates/solarium'),
    require('./templates/solarium-pd-consent'),
    require('./templates/solarium-pd-distribution'),
    require('./templates/solarium-marketing-consent'),
    require('./templates/solarium-privacy-policy'),
  ],
  barbershop: [
    require('./templates/barbershop'),
    require('./templates/barbershop-pd-consent'),
    require('./templates/barbershop-pd-distribution'),
    require('./templates/barbershop-marketing-consent'),
    require('./templates/barbershop-privacy-policy'),
  ],
  cleaning_basic: [
    require('./templates/cleaning-basic'),
    require('./templates/cleaning-basic-pd-consent'),
    require('./templates/cleaning-basic-pd-distribution'),
    require('./templates/cleaning-basic-marketing-consent'),
    require('./templates/cleaning-basic-privacy-policy'),
  ],
  // fitness_gym/cafe_basic/universal/dance/yoga добавлены 08.09.2026 —
  // раньше эти 5 ниш имели рабочий тест и roadmap, но НИ ОДНОГО шаблона
  // документа (найдено при разборе, почему у fitness_gym, шедшего вчера
  // "полностью готовой" нишей, ничего нет здесь). Оферта адаптирована под
  // специфику каждой ниши, три согласия и политика — общий текст, тот же
  // принцип, что и у остальных 9 ниш выше.
  fitness_gym: [
    require('./templates/fitness-gym'),
    require('./templates/fitness-gym-pd-consent'),
    require('./templates/fitness-gym-pd-distribution'),
    require('./templates/fitness-gym-marketing-consent'),
    require('./templates/fitness-gym-privacy-policy'),
  ],
  cafe_basic: [
    require('./templates/cafe-basic'),
    require('./templates/cafe-basic-pd-consent'),
    require('./templates/cafe-basic-pd-distribution'),
    require('./templates/cafe-basic-marketing-consent'),
    require('./templates/cafe-basic-privacy-policy'),
  ],
  universal: [
    require('./templates/universal'),
    require('./templates/universal-pd-consent'),
    require('./templates/universal-pd-distribution'),
    require('./templates/universal-marketing-consent'),
    require('./templates/universal-privacy-policy'),
  ],
  dance: [
    require('./templates/dance'),
    require('./templates/dance-pd-consent'),
    require('./templates/dance-pd-distribution'),
    require('./templates/dance-marketing-consent'),
    require('./templates/dance-privacy-policy'),
  ],
  yoga: [
    require('./templates/yoga'),
    require('./templates/yoga-pd-consent'),
    require('./templates/yoga-pd-distribution'),
    require('./templates/yoga-marketing-consent'),
    require('./templates/yoga-privacy-policy'),
  ],
  // pilates добавлен 09.09.2026 вместе с остальным контентом ниши (violations/
  // paid-questions/pdf) — см. комментарий в шапке violations/pilates.js.
  pilates: [
    require('./templates/pilates'),
    require('./templates/pilates-pd-consent'),
    require('./templates/pilates-pd-distribution'),
    require('./templates/pilates-marketing-consent'),
    require('./templates/pilates-privacy-policy'),
  ],
  martial_arts: [
    require('./templates/martial-arts'),
    require('./templates/martial-arts-pd-consent'),
    require('./templates/martial-arts-pd-distribution'),
    require('./templates/martial-arts-marketing-consent'),
    require('./templates/martial-arts-privacy-policy'),
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
