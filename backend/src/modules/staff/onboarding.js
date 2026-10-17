// Оформление сотрудника (17.10.2026, docs/franchise-funkcional.md Ф17).
// Список шагов не хранится — считается из того, как оформлен сотрудник
// (memberships.employment_type), иностранец ли он и ниши компании. В БД —
// только отметки «сделано» (staff_onboarding_steps, миграция 0137).
//
// Два шага с жёстким законным сроком (сведения в СФР и уведомление МВД)
// ставятся в «Сроки» от даты приёма — с обычными напоминаниями.
// Медкнижку здесь не отмечаем: сведения о здоровье (миграция 0125), для неё
// есть квартальное напоминание в scripts/dailyOperationsNudges.js.
const pool = require('../../db/pool');
const { registerDeadline } = require('../../core/deadlines');
const { moscowDateStr } = require('../../utils/moscowDate');

const EMPLOYMENT_TYPES = ['labor', 'gph', 'npd', 'none'];
const KIDS_NICHES = ['kids_club'];
// Сроки ставим только недавно принятым: у сотрудника, который работает
// давно, «сведения в СФР до вчера» были бы ложной тревогой — шаг остаётся
// в списке, но без срока.
const DEADLINE_WINDOW_DAYS = 30;

const STEPS = {
  contract_labor: {
    title: 'Трудовой договор подписан',
    hint: 'Два экземпляра: один остаётся у вас, второй — у сотрудника, с его подписью о получении.',
  },
  contract_gph: {
    title: 'Договор ГПХ подписан',
    hint: 'В договоре — конкретные услуги и сроки, без графика и подчинения. Иначе его могут признать трудовым.',
  },
  contract_npd: {
    title: 'Договор с самозанятым подписан',
    hint: 'В договоре — конкретные услуги и сроки, без графика и подчинения.',
  },
  local_acts: {
    title: 'Ознакомили под подпись с правилами распорядка и положением о персональных данных',
    hint: 'До подписания трудового договора (ст. 68 ТК РФ).',
  },
  sfr: {
    title: 'Сведения о приёме в СФР (форма ЕФС-1)',
    hint: 'Не позже следующего рабочего дня после договора. Подаёт бухгалтер или вы сами — через личный кабинет СФР или сервис отчётности. За опоздание — штраф 500 ₽ за каждого сотрудника.',
    deadline: { workingDays: 1, relatedType: 'staff_onboarding_sfr' },
  },
  briefing_ot: {
    title: 'Вводный инструктаж по охране труда',
    hint: 'В первый рабочий день, с записью в журнале.',
  },
  briefing_fire: {
    title: 'Противопожарный инструктаж',
    hint: 'До начала работы, с записью в журнале учёта инструктажей.',
  },
  npd_status: {
    title: 'Проверили статус самозанятого на сайте ФНС',
    hint: 'npd.nalog.ru — проверка по ИНН. Бывшего сотрудника нельзя оформлять самозанятым раньше чем через 2 года после увольнения.',
  },
  npd_receipts: {
    title: 'Договорились о чеках за каждую оплату',
    hint: 'Чек из приложения «Мой налог» — ваше подтверждение расхода.',
  },
  formalize: {
    title: 'Выберите, как оформить сотрудника',
    hint: 'Трудовой договор, ГПХ или самозанятый — у каждого свои шаги. Без договора у вас нет документов, если на смене что-то случится.',
    auto: true,
  },
  mvd: {
    title: 'Уведомление в МВД о приёме иностранца',
    hint: '3 рабочих дня с даты договора. Самый дорогой из сроков при найме: штраф для ИП и компании — от 400 тыс. ₽. Граждан ЕАЭС это тоже касается.',
    deadline: { workingDays: 3, relatedType: 'staff_onboarding_mvd' },
  },
  work_permit: {
    title: 'Проверили патент или разрешение на работу',
    hint: 'Граждане Казахстана, Кыргызстана, Армении и Беларуси (ЕАЭС) работают без патента.',
  },
  criminal_record: {
    title: 'Справка об отсутствии судимости',
    hint: 'Нужна при приёме у всех, кто может контактировать с детьми (ст. 351.1 ТК РФ). Отмечается в «Документах» ниже.',
    auto: true,
  },
};

function stepKeysFor({ employmentType, isForeign, niches }) {
  const keys = [];
  if (!employmentType || employmentType === 'none') {
    keys.push('formalize');
  } else if (employmentType === 'labor') {
    keys.push('contract_labor', 'local_acts', 'sfr', 'briefing_ot', 'briefing_fire');
  } else if (employmentType === 'gph') {
    keys.push('contract_gph', 'sfr');
  } else if (employmentType === 'npd') {
    keys.push('contract_npd', 'npd_status', 'npd_receipts');
  }
  if (isForeign && employmentType && employmentType !== 'none') {
    keys.push('mvd');
    if (employmentType !== 'npd') keys.push('work_permit');
  }
  if ((niches || []).some((n) => KIDS_NICHES.includes(n))) keys.push('criminal_record');
  return keys;
}

// Прибавить N рабочих дней — упрощённо, только выходные, без праздников
// (как subtractWorkingDaysUTC в core/taxDeadlines.js). Ошибка в сторону
// более раннего срока, не более позднего.
function addWorkingDays(dateStr, workingDays) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  let remaining = workingDays;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStr) {
  return Math.round((new Date(`${toStr}T00:00:00Z`) - new Date(`${fromStr}T00:00:00Z`)) / 86400000);
}

async function companyNiches(companyId) {
  const { rows } = await pool.query('SELECT niche FROM security_profile_niches WHERE company_id = $1', [companyId]);
  return rows.map((r) => r.niche);
}

// Шаги одного или всех сотрудников компании (кроме владельцев и уволенных).
async function listOnboarding(companyId, { membershipId = null } = {}) {
  const params = [companyId];
  let where = "m.company_id = $1 AND m.role != 'owner' AND m.active = true";
  if (membershipId) {
    params.push(membershipId);
    where += ` AND m.id = $${params.length}`;
  }
  const [members, niches, done, criminal] = await Promise.all([
    pool.query(
      `SELECT m.id, m.employment_type, m.is_foreign, to_char(m.hired_on, 'YYYY-MM-DD') AS hired_on
       FROM memberships m WHERE ${where}`,
      params
    ),
    companyNiches(companyId),
    pool.query('SELECT membership_id, step_key, done_at FROM staff_onboarding_steps WHERE company_id = $1', [companyId]),
    pool.query(
      "SELECT DISTINCT membership_id FROM staff_documents WHERE company_id = $1 AND doc_type = 'criminal_record_certificate'",
      [companyId]
    ),
  ]);
  const doneMap = new Map(done.rows.map((r) => [`${r.membership_id}:${r.step_key}`, r.done_at]));
  const withCriminal = new Set(criminal.rows.map((r) => r.membership_id));

  return members.rows.map((m) => {
    const keys = stepKeysFor({ employmentType: m.employment_type, isForeign: m.is_foreign, niches });
    const steps = keys.map((key) => {
      const def = STEPS[key];
      let isDone;
      if (key === 'formalize') isDone = false;
      else if (key === 'criminal_record') isDone = withCriminal.has(m.id);
      else isDone = doneMap.has(`${m.id}:${key}`);
      const dueDate = def.deadline && m.hired_on ? addWorkingDays(m.hired_on, def.deadline.workingDays) : null;
      return { key, title: def.title, hint: def.hint, auto: Boolean(def.auto), done: isDone, dueDate };
    });
    return {
      membershipId: m.id,
      employmentType: m.employment_type,
      isForeign: m.is_foreign,
      hiredOn: m.hired_on,
      steps,
      openCount: steps.filter((s) => !s.done).length,
    };
  });
}

// Привести «Сроки» в соответствие с шагами сотрудника: срок есть, пока шаг
// применим, не сделан и сотрудник принят недавно; иначе — закрыт или убран.
async function syncOnboardingDeadlines(companyId, membershipId, employeeName) {
  const [item] = await listOnboarding(companyId, { membershipId });
  const today = moscowDateStr(new Date());
  for (const [key, def] of Object.entries(STEPS)) {
    if (!def.deadline) continue;
    const relatedType = def.deadline.relatedType;
    const step = item?.steps.find((s) => s.key === key);
    const fresh = item?.hiredOn && daysBetween(item.hiredOn, today) <= DEADLINE_WINDOW_DAYS;
    if (!step || !step.dueDate || !fresh) {
      await pool.query('DELETE FROM deadlines WHERE related_entity_type = $1 AND related_entity_id = $2', [relatedType, membershipId]);
    } else if (step.done) {
      await pool.query(
        "UPDATE deadlines SET status = 'done' WHERE related_entity_type = $1 AND related_entity_id = $2",
        [relatedType, membershipId]
      );
    } else {
      await registerDeadline({
        companyId,
        category: 'staff',
        title: `${def.title} — ${employeeName}`,
        dueDate: step.dueDate,
        relatedEntityType: relatedType,
        relatedEntityId: membershipId,
      });
    }
  }
}

// Для пульта сети: только числа, без имён (франчайзер видит статусы, не людей).
async function onboardingCounts(companyId) {
  const items = await listOnboarding(companyId);
  return {
    staffTotal: items.length,
    staffWithOpenSteps: items.filter((i) => i.openCount > 0).length,
    openSteps: items.reduce((sum, i) => sum + i.openCount, 0),
  };
}

module.exports = { EMPLOYMENT_TYPES, STEPS, stepKeysFor, addWorkingDays, listOnboarding, syncOnboardingDeadlines, onboardingCounts };
