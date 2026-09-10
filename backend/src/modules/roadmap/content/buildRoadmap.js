// Собирает персональный roadmap открытия бизнеса из двух источников:
// 1) registrationSteps.js — создание самой юрформы (новый контент);
// 2) modules/security/content/violations/<niche>.js — уже опубликованная и
//    провenная матрица нарушений (аренда/уведомление/санитария/оборудование/
//    персонал/ПДн/пожарка), см. её же в отчёте безопасности (report/pdf.js,
//    roadmapBucket). Для открывающегося бизнеса это те же самые требования,
//    просто "сделать заранее" вместо "устранить нарушение" — единый
//    источник фактов, без дублирования цифр в отдельном roadmap-контенте.
const { registrationItems } = require('./registrationSteps');
const { SEGMENTS } = require('../../security/content/segments');

// 08.09.2026 (владелец: "ниши в роадмапе должны подхватываться из актуальных
// ниш на платформе") — раньше список ниш здесь дублировался вручную и минимум
// дважды отставал от реальности (cleaning_basic и barbershop добавлены
// 19.08.2026 с опозданием, "пропуск, не осознанное решение" — см. историю
// правок этого файла и аналогичный комментарий в admin.routes.js/analytics).
// Сам список и подписи ниш теперь читаются из segments.js — единственного
// источника правды о нишах платформы (см. его шапку). Здесь остаётся только
// то, что физически не может жить в segments.js: путь до файла с контентом
// нарушений для каждой ниши.
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
  cafe_basic: require('../../security/content/violations/cafe-basic'),
  fitness_gym: require('../../security/content/violations/fitness-gym'),
  // universal (сегменты "Розничная торговля" и "Другое") добавлен 08.09.2026
  // вместе с этим рефакторингом — контент (violations/universal.js) готов и
  // используется в тесте безопасности с 30.08.2026, но в roadmap ни разу не
  // попадал: раньше список ниш здесь просто не пересекался со списком
  // segments.js, и появление новой ниши в одном месте не значило появление
  // её в другом.
  universal: require('../../security/content/violations/universal'),
  // dance и yoga (сегмент "Фитнес и активность") добавлены 08.09.2026 —
  // новый контент (адаптация fitness_gym.js, research law-compliance-monitor
  // того же дня), см. шапки violations/dance.js и violations/yoga.js. Это
  // расширяет ТОЛЬКО roadmap: paid-questions/{dance,yoga}.js (контент
  // бесплатного теста на 34 вопроса) ещё не написан, поэтому в segments.js
  // paidAudit у обеих ниш сознательно остаётся false — свободный тест и
  // PDF-отчёт по ним пока недоступны, это отдельная, более крупная задача.
  dance: require('../../security/content/violations/dance'),
  yoga: require('../../security/content/violations/yoga'),
  // pilates (09.09.2026, сегмент "Фитнес и активность") — контент готов
  // сразу для теста и roadmap (в отличие от dance/yoga на момент их
  // добавления выше), paidAudit: true в segments.js с самого начала.
  pilates: require('../../security/content/violations/pilates'),
  martial_arts: require('../../security/content/violations/martial-arts'),
  // atelier (10.09.2026, новый сегмент "Бытовые услуги") — контент готов
  // сразу для теста и roadmap, paidAudit: true в segments.js с самого начала.
  atelier: require('../../security/content/violations/atelier'),
  shoe_repair: require('../../security/content/violations/shoe-repair'),
  photo_studio: require('../../security/content/violations/photo-studio'),
};

// Подпись берём из segments.js, включаем нишу только если для неё реально
// есть контент нарушений выше — иначе в тесте безопасности ниша уже видна
// (paidAudit может быть true), а материала для отдельного платного roadmap
// ещё нет, и buildStages() ниже упадёт на VIOLATIONS_BY_NICHE[niche]
// undefined. dance/yoga (segments.js, paidAudit:false) сюда пока не
// попадают ровно поэтому — не потому что забыли, а потому что для них
// действительно нет контента.
const NICHE_LABELS = Object.fromEntries(
  SEGMENTS.flatMap((s) => s.niches)
    .filter((n) => VIOLATIONS_BY_NICHE[n.key])
    .map((n) => [n.key, n.label])
);

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

// 07.09.2026 (владелец: "карта плохая, продукт за 1490₽ должен быть
// подробным, как обычный отчёт теста безопасности, а не куцым списком
// заголовков") — раньше сюда попадали только title/solution/срок, теряя
// то, что реально делает обычный PDF-отчёт (report/pdf.js, violationBlock)
// содержательным: риск, штраф, норму закона и пошаговую инструкцию (howTo).
// Ничего не придумываем заново — те же самые проверенные поля из той же
// матрицы нарушений, просто больше не обрезаем их для этого продукта.
function toItem(v) {
  return {
    title: TITLE_OVERRIDES[v.title] || v.title,
    description: v.description,
    risk: v.risk,
    fineText: v.fineText,
    normBase: v.normBase,
    solution: v.solution,
    howTo: v.howTo || [],
    free: v.free,
    costMin: v.costMin,
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
