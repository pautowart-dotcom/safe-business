const pool = require('../../db/pool');

// Вынесено из security.routes.js (29.08.2026, Фаза A плана
// "replicated-cooking-rainbow.md") — общий источник правды для того, какие
// модули добавляет/скрывает конкретная ниша. Раньше жило только в
// security.routes.js и вызывалось лишь при сохранении полного профиля
// (security_profiles) — теперь дополнительно вызывается сразу на
// регистрации (auth.routes.js, signup_niche), чтобы ЛК выглядел
// подстроенным под нишу с первого входа, а не только после отдельного
// прохождения теста безопасности.

// Ниши, которым по умолчанию нужен ещё какой-то модуль сверх общего набора
// (clients/visits уже включены всем компаниям, см. auth.routes.js) —
// 20.08.2026, владелец не хочет вручную включать "Заявки" в админке под
// каждую клининговую компанию, включаем сами, как только клининг попадает в
// список ниш профиля.
//
// 20.08.2026, тот же день, найдено на реальном тесте: ON CONFLICT DO NOTHING
// (как задумывалось раньше — "не перезаписывать чужое ручное выключение")
// оказалось хуже своей цели — если строка company_modules когда-либо
// создалась выключенной (например, сохранение профиля попало на момент
// незавершённого деплоя раньше в этот же день), DO NOTHING не может
// самоисправиться НИКОГДА, даже при повторном сохранении профиля с той же
// нишей — обнаружено именно так на живом тесте. Переключено на DO UPDATE —
// самоисправляется при каждом сохранении профиля с нужной нишей. Такой
// модуль пока и не может быть выключен владельцем вручную (нет
// самостоятельного тумблера в интерфейсе клиента, только у админа
// платформы) — риск перезаписать чьё-то осознанное решение сейчас чисто
// гипотетический, а надёжность важнее.
const NICHE_EXTRA_MODULES = {
  cleaning_basic: ['leads'],
};

// Обратная сторона NICHE_EXTRA_MODULES: модуль из общего набора, который
// конкретной нише не нужен. Решено пока только одно правило (29.08.2026): у
// Общепита нет модели "визит к мастеру" (точки продаж, не запись на услугу).
// Остальные ниши/модули — черновик в docs/niche-module-matrix.md, требуют
// отдельного разбора по одной нише, сюда переносятся только после того, как
// решение принято, не как предположение.
const NICHE_HIDDEN_MODULES = {
  cafe_basic: ['visits'],
};

async function ensureNicheModules(companyId, niches) {
  const addKeys = new Set();
  for (const niche of niches) {
    for (const key of NICHE_EXTRA_MODULES[niche] || []) addKeys.add(key);
  }
  for (const moduleKey of addKeys) {
    await pool.query(
      `INSERT INTO company_modules (company_id, module_key, enabled) VALUES ($1, $2, true)
       ON CONFLICT (company_id, module_key) DO UPDATE SET enabled = true`,
      [companyId, moduleKey]
    );
  }

  // Скрыть модуль только если НИ ОДНА из выбранных ниш в нём не нуждается —
  // при мультивыборе (сегмент "Красота и здоровье") одна ниша не должна
  // прятать то, что явно нужно другой выбранной нише той же компании.
  // Тот же self-heal принцип, что и выше: пересчитывается заново при каждом
  // вызове, поэтому модуль, который раньше был скрыт, сам вернётся, если
  // владелец добавил нишу, которой он нужен.
  const hiddenPerNiche = niches.map((n) => new Set(NICHE_HIDDEN_MODULES[n] || []));
  const allHideCandidates = new Set(Object.values(NICHE_HIDDEN_MODULES).flat());
  for (const moduleKey of allHideCandidates) {
    const shouldHide = hiddenPerNiche.length > 0 && hiddenPerNiche.every((s) => s.has(moduleKey));
    await pool.query(
      `INSERT INTO company_modules (company_id, module_key, enabled) VALUES ($1, $2, $3)
       ON CONFLICT (company_id, module_key) DO UPDATE SET enabled = $3`,
      [companyId, moduleKey, !shouldHide]
    );
  }
}

module.exports = { NICHE_EXTRA_MODULES, NICHE_HIDDEN_MODULES, ensureNicheModules };
