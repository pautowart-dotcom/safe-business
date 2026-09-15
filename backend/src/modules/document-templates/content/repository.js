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
  // atelier добавлен 10.09.2026 вместе с остальным контентом ниши (первая
  // ниша сегмента "Бытовые услуги") — см. комментарий в шапке
  // violations/atelier.js.
  atelier: [
    require('./templates/atelier'),
    require('./templates/atelier-pd-consent'),
    require('./templates/atelier-pd-distribution'),
    require('./templates/atelier-marketing-consent'),
    require('./templates/atelier-privacy-policy'),
  ],
  // shoe_repair добавлен 10.09.2026 вместе с остальным контентом ниши
  // (второй заход в сегменте "Бытовые услуги") — см. комментарий в шапке
  // violations/shoe-repair.js.
  shoe_repair: [
    require('./templates/shoe-repair'),
    require('./templates/shoe-repair-pd-consent'),
    require('./templates/shoe-repair-pd-distribution'),
    require('./templates/shoe-repair-marketing-consent'),
    require('./templates/shoe-repair-privacy-policy'),
  ],
  // photo_studio добавлен 10.09.2026 вместе с остальным контентом ниши
  // (третий заход в сегменте "Бытовые услуги") — 6-й шаблон
  // (photo-studio-minor-consent) специфичен именно для этой ниши, см.
  // комментарий в шапке violations/photo-studio.js.
  photo_studio: [
    require('./templates/photo-studio'),
    require('./templates/photo-studio-pd-consent'),
    require('./templates/photo-studio-pd-distribution'),
    require('./templates/photo-studio-marketing-consent'),
    require('./templates/photo-studio-privacy-policy'),
    require('./templates/photo-studio-minor-consent'),
  ],
  // dry_cleaning добавлен 10.09.2026 вместе с остальным контентом ниши
  // (четвёртый заход в сегменте "Бытовые услуги") — см. комментарий в шапке
  // violations/dry-cleaning.js.
  dry_cleaning: [
    require('./templates/dry-cleaning'),
    require('./templates/dry-cleaning-pd-consent'),
    require('./templates/dry-cleaning-pd-distribution'),
    require('./templates/dry-cleaning-marketing-consent'),
    require('./templates/dry-cleaning-privacy-policy'),
  ],
  // pet_grooming добавлен 12.09.2026 вместе с остальным контентом ниши
  // (первая ниша нового сегмента "Услуги для животных") — см. комментарий в
  // шапке violations/pet-grooming.js.
  pet_grooming: [
    require('./templates/pet-grooming'),
    require('./templates/pet-grooming-pd-consent'),
    require('./templates/pet-grooming-pd-distribution'),
    require('./templates/pet-grooming-marketing-consent'),
    require('./templates/pet-grooming-privacy-policy'),
  ],
  // pet_boarding добавлен 14.09.2026 (вторая ниша сегмента "Услуги для
  // животных") — см. комментарий в шапке violations/pet-boarding.js.
  pet_boarding: [
    require('./templates/pet-boarding'),
    require('./templates/pet-boarding-pd-consent'),
    require('./templates/pet-boarding-pd-distribution'),
    require('./templates/pet-boarding-marketing-consent'),
    require('./templates/pet-boarding-privacy-policy'),
  ],
  // appliance_repair добавлен 14.09.2026 (сегмент "Бытовые услуги") — см.
  // комментарий в шапке violations/appliance-repair.js.
  appliance_repair: [
    require('./templates/appliance-repair'),
    require('./templates/appliance-repair-pd-consent'),
    require('./templates/appliance-repair-pd-distribution'),
    require('./templates/appliance-repair-marketing-consent'),
    require('./templates/appliance-repair-privacy-policy'),
  ],
  // watch_jewelry_repair добавлен 14.09.2026 (сегмент "Бытовые услуги") —
  // см. комментарий в шапке violations/watch-jewelry-repair.js.
  watch_jewelry_repair: [
    require('./templates/watch-jewelry-repair'),
    require('./templates/watch-jewelry-repair-pd-consent'),
    require('./templates/watch-jewelry-repair-pd-distribution'),
    require('./templates/watch-jewelry-repair-marketing-consent'),
    require('./templates/watch-jewelry-repair-privacy-policy'),
  ],
  // car_wash добавлен 14.09.2026 (первая ниша нового сегмента "Услуги для
  // автомобилей") — см. комментарий в шапке violations/car-wash.js.
  car_wash: [
    require('./templates/car-wash'),
    require('./templates/car-wash-pd-consent'),
    require('./templates/car-wash-pd-distribution'),
    require('./templates/car-wash-marketing-consent'),
    require('./templates/car-wash-privacy-policy'),
  ],
  // tire_service добавлен 15.09.2026 (вторая ниша сегмента "Услуги для
  // автомобилей") — см. комментарий в шапке violations/tire-service.js.
  tire_service: [
    require('./templates/tire-service'),
    require('./templates/tire-service-pd-consent'),
    require('./templates/tire-service-pd-distribution'),
    require('./templates/tire-service-marketing-consent'),
    require('./templates/tire-service-privacy-policy'),
  ],
  // auto_service добавлен 15.09.2026 (третья ниша сегмента "Услуги для
  // автомобилей") — "оферта" здесь по содержанию заказ-наряд по ПП №780, см.
  // комментарий в шапке templates/auto-service.js.
  auto_service: [
    require('./templates/auto-service'),
    require('./templates/auto-service-pd-consent'),
    require('./templates/auto-service-pd-distribution'),
    require('./templates/auto-service-marketing-consent'),
    require('./templates/auto-service-privacy-policy'),
  ],
  // kids_club добавлен 15.09.2026 (первая ниша нового сегмента "Услуги для
  // детей") — согласия оформлены от лица законного представителя, см.
  // комментарий в шапке templates/kids-club.js.
  kids_club: [
    require('./templates/kids-club'),
    require('./templates/kids-club-pd-consent'),
    require('./templates/kids-club-pd-distribution'),
    require('./templates/kids-club-marketing-consent'),
    require('./templates/kids-club-privacy-policy'),
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
