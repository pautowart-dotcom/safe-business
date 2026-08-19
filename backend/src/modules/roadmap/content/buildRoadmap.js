// Собирает персональный roadmap открытия бизнеса из двух источников:
// 1) registrationSteps.js — создание самой юрформы (новый контент);
// 2) modules/security/content/violations/<niche>.js — уже опубликованная и
//    провenная матрица нарушений (аренда/уведомление/санитария/оборудование/
//    персонал/ПДн/пожарка), см. её же в отчёте безопасности (report/pdf.js,
//    roadmapBucket). Для открывающегося бизнеса это те же самые требования,
//    просто "сделать заранее" вместо "устранить нарушение" — единый
//    источник фактов, без дублирования цифр в отдельном roadmap-контенте.
const { registrationItems } = require('./registrationSteps');

// cleaning_basic и barbershop добавлены 19.08.2026 — cleaning_basic сюда не
// попал при своём добавлении (пропуск, не осознанное решение): чек-лист
// открытия бизнеса для этой ниши почти неделю показывал только шаги
// регистрации юрформы, без пунктов из матрицы нарушений.
const VIOLATIONS_BY_NICHE = {
  manicure: require('../../security/content/violations/manicure'),
  lashes_brows: require('../../security/content/violations/lashes-brows'),
  hair: require('../../security/content/violations/hair'),
  massage: require('../../security/content/violations/massage'),
  tattoo: require('../../security/content/violations/tattoo'),
  depilation: require('../../security/content/violations/depilation'),
  solarium: require('../../security/content/violations/solarium'),
  cleaning_basic: require('../../security/content/violations/cleaning-basic'),
  barbershop: require('../../security/content/violations/barbershop'),
};

const NICHE_LABELS = {
  manicure: 'Маникюр и педикюр',
  lashes_brows: 'Ресницы и брови',
  hair: 'Волосы (парикмахерские услуги)',
  massage: 'Массаж (без медицинской лицензии)',
  tattoo: 'Тату, пирсинг и перманентный макияж',
  depilation: 'Депиляция (шугаринг, воск, нить)',
  solarium: 'Солярий',
  cleaning_basic: 'Уборка помещений (жильё и офисы)',
  barbershop: 'Барбершоп',
};

const LEGAL_FORM_LABELS = {
  self_employed: 'Самозанятый (НПД)',
  ip: 'ИП',
  ooo: 'ООО',
};

// Код "-502" в каждой нише — "Подмена трудовых отношений": предупреждение
// про риск при уже идущей работе с людьми, не задача из чек-листа открытия
// — исключаем из roadmap, чтобы не путать с обычными пунктами "сделать X".
function isWarningNotTask(code) {
  return code.endsWith('-502');
}

function durationNoteFromDays(daysMin, daysMax) {
  if (daysMin == null) return null;
  if (!daysMax || daysMax === daysMin) return `~${daysMin} дн.`;
  return `${daysMin}–${daysMax} дн.`;
}

// "-доп" записи в матрице нарушений сформулированы как констатация проблемы
// ("Отсутствует рециркулятор"), а не как задача — во всех остальных записях
// title всегда нейтральная именная фраза ("Крафт-пакеты", "Договор аренды").
// Для чек-листа открытия переформулируем именно заголовок в тот же стиль,
// содержание (solution/сроки) не трогаем.
const TITLE_OVERRIDES = {
  'Отсутствует рециркулятор': 'Рециркулятор воздуха',
};

function toItem(v) {
  return {
    title: TITLE_OVERRIDES[v.title] || v.title,
    description: v.solution,
    durationNote: durationNoteFromDays(v.daysMin, v.daysMax),
  };
}

// "-доп" ("MN-206-доп" и т.п.) — не "альтернативная версия кода MN-206"
// (это разные, не связанные пункты — совпадение цифр случайное, "-доп"
// значит "запись, вставленная дополнительно перед соседним кодом", не
// суффикс парного варианта). Раньше здесь была попытка слить "-доп" с
// "базовым" кодом того же номера через отбрасывание суффикса — на практике
// это слило рециркулятор (206-доп) с ППК (206, другой, никак не связанный
// пункт) и тихо потеряло задачу про ППК. Правильно — не гадать пары, а
// включать каждую запись как есть.
function selectBlockItems(violations, block) {
  return violations.filter((v) => v.block === block && !isWarningNotTask(v.code)).map(toItem);
}

// includeRegistration=false пропускает пункты создания самой юрформы
// (ИП/ООО/самозанятость) — для случая, когда компания уже зарегистрирована
// и нужен только чек-лист по новому адресу/точке. Пока не используется нигде
// (см. хендофф про идею "roadmap второй точки" — открыт вопрос, что такое
// "вторая точка" в текущей модели продукта, где "Филиалы" убраны), но сам
// движок это уже умеет — не пришлось бы переписывать buildStages ради этого.
function buildStages({ niche, legalForm, hasEmployees, includeRegistration = true }) {
  const { violations } = VIOLATIONS_BY_NICHE[niche];

  const rawStages = [
    {
      title: 'Регистрация и адрес',
      items: [...(includeRegistration ? registrationItems(legalForm) : []), ...selectBlockItems(violations, 1)],
    },
    {
      title: 'Санитария',
      items: selectBlockItems(violations, 2),
    },
    {
      title: 'Оборудование и материалы',
      items: selectBlockItems(violations, 3),
    },
    {
      title: 'Документы для клиентов и персональные данные',
      items: selectBlockItems(violations, 5),
    },
    {
      title: 'Пожарная безопасность',
      items: selectBlockItems(violations, 6),
    },
    hasEmployees
      ? {
          title: 'Если нанимаете сотрудников',
          items: selectBlockItems(violations, 4),
        }
      : null,
    {
      title: 'Можно отложить на потом — не блокирует открытие',
      items: selectBlockItems(violations, 7),
    },
  ].filter((s) => s && s.items.length > 0);

  return rawStages.map((s, i) => ({ ...s, weekLabel: `Неделя ${i + 1}` }));
}

function buildRoadmap({ niche, legalForm, hasEmployees, includeRegistration = true }) {
  return {
    niche,
    nicheLabel: NICHE_LABELS[niche],
    legalForm,
    legalFormLabel: LEGAL_FORM_LABELS[legalForm],
    stages: buildStages({ niche, legalForm, hasEmployees: !!hasEmployees, includeRegistration }),
    disclaimer:
      'Roadmap носит информационный характер и не является юридической консультацией. Сроки указаны по федеральным нормам и практическим оценкам; часть требований (например, стоимость патента) зависит от региона — уточняйте в вашей налоговой или местных органах.',
  };
}

module.exports = { buildRoadmap, NICHE_LABELS, LEGAL_FORM_LABELS };
