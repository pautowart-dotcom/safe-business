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

// Слоты, общие для всех известных режимов, специфичные — только для тех
// регимов, где сроки достаточно стандартны, чтобы их можно было посчитать
// без доп. данных (например, оплата патента зависит от даты начала и
// срока действия конкретного патента, которых мы не храним — поэтому для
// 'patent' генерируются только общие для ИП взносы, без специфики самого
// патента; отметку об оплате патента компания ведёт сама, через "Готово").
function computeSlots(regime, year) {
  const slots = {
    // Фиксированные страховые взносы ИП "за себя" — единый срок для всех
    // режимов, кроме ОСН для юрлиц (для простоты считаем ИП-контекст,
    // отмечено в дисклеймере выше).
    insurance_fixed: {
      title: `Фиксированные страховые взносы ИП за ${year} год — сверьте сумму с ФНС`,
      dueDate: `${year}-12-31`,
    },
    // 1% с дохода свыше 300 000 ₽ за прошедший год — срок в следующем году.
    insurance_extra: {
      title: `Доплата 1% страховых взносов с дохода свыше 300 000 ₽ за ${year} год`,
      dueDate: `${year + 1}-07-01`,
    },
  };

  if (regime === 'usn_income' || regime === 'usn_income_expense') {
    slots.usn_q1 = { title: `УСН: авансовый платёж за 1 квартал ${year}`, dueDate: `${year}-04-25` };
    slots.usn_q2 = { title: `УСН: авансовый платёж за полугодие ${year}`, dueDate: `${year}-07-25` };
    slots.usn_q3 = { title: `УСН: авансовый платёж за 9 месяцев ${year}`, dueDate: `${year}-10-25` };
    slots.usn_annual = { title: `УСН: итоговый налог и декларация за ${year} год`, dueDate: `${year + 1}-04-30` };
  }

  return slots;
}

const ALL_SLOT_KEYS = ['insurance_fixed', 'insurance_extra', 'usn_q1', 'usn_q2', 'usn_q3', 'usn_annual'];

// Пересчитывает налоговые дедлайны компании под текущий режим и текущий
// календарный год. Вызывается при сохранении режима в Настройках. Смены
// года без повторного захода в Настройки не отслеживаются — тут нет
// плановой задачи (cron), которая перегенерировала бы сроки на новый год
// автоматически; это ограничение MVP, а не намеренное решение.
async function syncTaxDeadlines(companyId, regime) {
  const year = new Date().getFullYear();
  const desired = regime ? computeSlots(regime, year) : {};

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
