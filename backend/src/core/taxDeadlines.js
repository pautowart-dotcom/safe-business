const pool = require('../db/pool');
const { registerDeadline } = require('./deadlines');

// ВАЖНО — даты и сама применимость правил ниже реализованы по общим
// ориентирам для ИП на популярных режимах и МОГУТ БЫТЬ НЕТОЧНЫМИ для
// конкретной компании (организационная форма, регион, льготы, изменения
// законодательства). Перед реальным использованием обязательно сверить
// список с бухгалтером/юристом — это ориентир, не источник истины.
const TAX_REGIMES = [
  { key: 'patent', label: 'Патент (ПСН)' },
  { key: 'usn_income', label: 'УСН «Доходы» (6%)' },
  { key: 'usn_income_expense', label: 'УСН «Доходы минус расходы» (15%)' },
  { key: 'osn', label: 'ОСН (общая система)' },
];

// Конец соответствующего квартала — используется, чтобы не создавать
// напоминание о периоде, который целиком закончился ДО регистрации ИП
// (например, ИП открыт в августе — кварталы 1 и 2 к нему не относятся,
// а 3-й, в который попадает август, относится). Это не "предсказание"
// даты (которое нам запрещено), а чистая календарная арифметика.
const QUARTER_END = {
  q1: (year) => `${year}-03-31`,
  q2: (year) => `${year}-06-30`,
  q3: (year) => `${year}-09-30`,
  q4: (year) => `${year}-12-31`,
};

// Слоты, общие для всех известных режимов, специфичные — только для тех
// регимов, где сроки достаточно стандартны, чтобы их можно было посчитать
// без доп. данных (например, оплата патента зависит от даты начала и
// срока действия конкретного патента, которых мы не храним — поэтому для
// 'patent' генерируются только общие для ИП взносы, без специфики самого
// патента; отметку об оплате патента компания ведёт сама, через "Готово").
//
// ipRegisteredAt/hasEmployees — необязательные исходные данные из вкладки
// "Мои сроки" (Пакет 4, Этап 2): ipRegisteredAt отсекает уже прошедшие на
// момент регистрации кварталы, hasEmployees добавляет отчётность за
// сотрудников (РСВ/6-НДФЛ), независимую от налогового режима.
function computeSlots(regime, year, { ipRegisteredAt = null, hasEmployees = false } = {}) {
  const slots = {};

  // Взносы/налог по режиму — только если режим известен (как и раньше:
  // без выбранного режима непонятно, ИП ли это вообще и на каких условиях).
  if (regime) {
    // Фиксированные страховые взносы ИП "за себя" — единый срок для всех
    // режимов, кроме ОСН для юрлиц (для простоты считаем ИП-контекст,
    // отмечено в дисклеймере выше).
    slots.insurance_fixed = {
      title: `Фиксированные страховые взносы ИП за ${year} год — сверьте сумму с ФНС`,
      dueDate: `${year}-12-31`,
    };
    // 1% с дохода свыше 300 000 ₽ за прошедший год — срок в следующем году.
    slots.insurance_extra = {
      title: `Доплата 1% страховых взносов с дохода свыше 300 000 ₽ за ${year} год`,
      dueDate: `${year + 1}-07-01`,
    };

    if (regime === 'usn_income' || regime === 'usn_income_expense') {
      slots.usn_q1 = { title: `УСН: авансовый платёж за 1 квартал ${year}`, dueDate: `${year}-04-25`, quarterEnd: QUARTER_END.q1(year) };
      slots.usn_q2 = { title: `УСН: авансовый платёж за полугодие ${year}`, dueDate: `${year}-07-25`, quarterEnd: QUARTER_END.q2(year) };
      slots.usn_q3 = { title: `УСН: авансовый платёж за 9 месяцев ${year}`, dueDate: `${year}-10-25`, quarterEnd: QUARTER_END.q3(year) };
      slots.usn_annual = { title: `УСН: итоговый налог и декларация за ${year} год`, dueDate: `${year + 1}-04-30`, quarterEnd: QUARTER_END.q4(year) };
    }
  }

  // Отчётность за сотрудников — обязанность работодателя, не зависит от
  // налогового режима, поэтому генерируется отдельно по одному hasEmployees.
  if (hasEmployees) {
    slots.emp_q1 = { title: `Отчётность за сотрудников (РСВ, 6-НДФЛ) за 1 квартал ${year}`, dueDate: `${year}-04-25`, quarterEnd: QUARTER_END.q1(year) };
    slots.emp_q2 = { title: `Отчётность за сотрудников (РСВ, 6-НДФЛ) за полугодие ${year}`, dueDate: `${year}-07-25`, quarterEnd: QUARTER_END.q2(year) };
    slots.emp_q3 = { title: `Отчётность за сотрудников (РСВ, 6-НДФЛ) за 9 месяцев ${year}`, dueDate: `${year}-10-25`, quarterEnd: QUARTER_END.q3(year) };
    slots.emp_annual = { title: `Отчётность за сотрудников (РСВ, 6-НДФЛ) за ${year} год`, dueDate: `${year + 1}-02-25`, quarterEnd: QUARTER_END.q4(year) };
  }

  if (ipRegisteredAt) {
    for (const key of Object.keys(slots)) {
      if (slots[key].quarterEnd && ipRegisteredAt > slots[key].quarterEnd) delete slots[key];
    }
  }

  return slots;
}

const ALL_SLOT_KEYS = [
  'insurance_fixed', 'insurance_extra',
  'usn_q1', 'usn_q2', 'usn_q3', 'usn_annual',
  'emp_q1', 'emp_q2', 'emp_q3', 'emp_annual',
];

// Пересчитывает налоговые дедлайны компании под текущий режим/исходные
// данные и текущий календарный год. Вызывается при сохранении налоговых
// настроек на вкладке "Мои сроки". Смены года без повторного захода в
// настройки не отслеживаются — тут нет плановой задачи (cron), которая
// перегенерировала бы сроки на новый год автоматически; это ограничение
// MVP, а не намеренное решение.
async function syncTaxDeadlines(companyId, regime, { ipRegisteredAt = null, hasEmployees = false } = {}) {
  const year = new Date().getFullYear();
  const desired = computeSlots(regime, year, { ipRegisteredAt, hasEmployees });

  for (const slotKey of ALL_SLOT_KEYS) {
    const relatedEntityType = `tax:${slotKey}`;
    if (desired[slotKey]) {
      await registerDeadline({
        companyId,
        category: 'tax',
        title: desired[slotKey].title,
        dueDate: desired[slotKey].dueDate,
        relatedEntityType,
        relatedEntityId: companyId,
      });
    } else {
      await pool.query('DELETE FROM deadlines WHERE company_id = $1 AND related_entity_type = $2 AND related_entity_id = $3', [
        companyId,
        relatedEntityType,
        companyId,
      ]);
    }
  }
}

module.exports = { TAX_REGIMES, syncTaxDeadlines };
