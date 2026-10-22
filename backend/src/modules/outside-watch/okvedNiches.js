// Подсказка ниши теста по основному ОКВЭД из реестра (22.10.2026). Только
// подсказка — нишу владелец подтверждает сам: один код покрывает разные
// ниши (96.02.2 — и маникюр, и брови, и косметология), а записанный в
// реестре ОКВЭД не всегда совпадает с тем, чем бизнес реально занимается.
// Порядок — от точного префикса к общему, берётся первое совпадение.
// Ключи ниш — как в frontend/src/ui/nicheOptions.js.
const OKVED_NICHES = [
  ['96.02.1', ['hair', 'barbershop']],
  ['96.02.2', ['manicure', 'lashes_brows', 'cosmetology', 'depilation']],
  ['96.02', ['manicure', 'hair', 'lashes_brows', 'cosmetology', 'barbershop', 'depilation']],
  ['96.04', ['solarium', 'massage']],
  ['96.01', ['dry_cleaning']],
  ['95.29.1', ['atelier']],
  ['14.1', ['atelier']],
  ['95.23', ['shoe_repair']],
  ['95.25', ['watch_jewelry_repair']],
  ['95.22', ['appliance_repair']],
  ['95.1', ['device_repair']],
  ['74.20', ['photo_studio']],
  ['45.20', ['auto_service', 'car_wash', 'tire_service']],
  ['93.13', ['fitness_gym']],
  ['85.41', ['kids_club', 'dance', 'martial_arts']],
  ['81.22', ['facade_cleaning']],
  ['81.2', ['cleaning_basic', 'renovation_cleaning']],
  ['56.30', ['coffee_shop']],
  ['56.10', ['cafe_basic', 'street_food']],
  ['10.71', ['bakery_confectionery', 'custom_cakes']],
];

function nichesForOkved(code) {
  if (!code) return [];
  const hit = OKVED_NICHES.find(([prefix]) => code === prefix || code.startsWith(`${prefix}.`) || code.startsWith(prefix));
  return hit ? hit[1] : [];
}

module.exports = { nichesForOkved };
