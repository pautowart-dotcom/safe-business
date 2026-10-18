// Что можно сделать со сроком/действием из /platform/deadlines (18.10.2026):
// одна таблица и для «Дедлайнов», и для шторки на главной — раньше эти
// правила жили только в Deadlines.jsx. Каждое действие — переход
// { label, to, state, primary } или отметка { label, done: true }.
// Допечатка журнала (generated_journal_reprint) скачивает файл — это
// остаётся в Deadlines.jsx, отсюда туда ведёт «Открыть».

const MANUAL_KEYS_WITH_INSTRUCTION = [
  'esign', 'briefing_repeat', 'lease_end', 'fire_extinguisher', 'fire_alarm_service',
  'electrical_resistance', 'disinfection_contract', 'medwaste_contract', 'mswaste_contract',
  'ofd_contract',
];

export function deadlineActions(item) {
  const t = item.related_entity_type || '';
  const actions = [];
  let canMarkDone = true;

  if (t === 'generated_journal_reprint') {
    return [{ label: 'Открыть в сроках', to: '/deadlines', primary: true }];
  }
  if (t === 'ai_advisor_digest') {
    return [{ label: 'Открыть советника', to: '/ai-advisor', primary: true }];
  }
  if (t.startsWith('monthly_check:')) {
    return [{ label: 'Пройти проверку', to: '/monthly-check', primary: true }];
  }
  if (t.startsWith('business_status:')) {
    const key = t.slice('business_status:'.length);
    canMarkDone = false;
    if (key === 'legal_form_unknown') actions.push({ label: 'Уточнить', to: '/security', state: { tab: 'my_deadlines' }, primary: true });
    else actions.push({ label: 'Подробнее', to: `/business-status/${key}`, primary: true });
  }
  if (t === 'security_violation') {
    canMarkDone = false;
    actions.push({ label: 'Как исправить', to: '/security', state: { dashboardTab: 'violations' }, primary: true });
    actions.push({ label: 'Спросить ИИ', to: '/ai-advisor', state: { prefillQuestion: `Что мне делать с нарушением «${item.title}»?` } });
  }
  if (t === 'test_findings_followup') actions.push({ label: 'Посмотреть', to: '/security', state: { dashboardTab: 'violations' }, primary: true });
  if (t.startsWith('document_verify:')) {
    canMarkDone = false;
    actions.push({ label: 'Проверить документ', to: '/security', state: { dashboardTab: 'documents' }, primary: true });
  }
  if (t === 'document_risk_check_review') {
    canMarkDone = false;
    actions.push({ label: 'Открыть проверку', to: '/security', state: { dashboardTab: 'documents' }, primary: true });
  }
  if (t === 'inspection_order') actions.push({ label: 'Открыть предписание', to: '/security', state: { dashboardTab: 'inspection' } });
  if (t.startsWith('manual:') && MANUAL_KEYS_WITH_INSTRUCTION.includes(t.slice('manual:'.length))) {
    actions.push({ label: 'Как продлить', to: '/security', state: { tab: 'my_deadlines' } });
  }
  if (canMarkDone) actions.push({ label: 'Готово, отметить', done: true, primary: actions.length === 0 });
  return actions;
}

export function daysLeft(dueDate) {
  const ms = new Date(dueDate) - new Date(new Date().toDateString());
  return Math.round(ms / 86400000);
}

// Метка справа в строке: «Просрочено», «Сегодня», «12 дней», «30 окт».
export function dueTag(item) {
  if (!item.due_date) return { text: 'Сейчас', tone: 'orange' };
  const left = daysLeft(item.due_date);
  if (left < 0) return { text: 'Просрочено', tone: 'red' };
  if (left === 0) return { text: 'Сегодня', tone: 'red' };
  if (left <= 14) return { text: `${left} ${plural(left, 'день', 'дня', 'дней')}`, tone: left <= 7 ? 'red' : 'orange' };
  return { text: new Date(item.due_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }), tone: 'gray' };
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const CATEGORY_ICON = { staff: 'team', premises: 'home', documents: 'doc', tax: 'finance', financial: 'finance', operations: 'check' };
export function deadlineIcon(item) {
  if (item.related_entity_type === 'security_violation') return 'shield';
  if (item.related_entity_type?.startsWith('monthly_check:')) return 'check';
  if (item.related_entity_type === 'ai_advisor_digest') return 'spark';
  return CATEGORY_ICON[item.category] || 'doc';
}

// Название срока внутри фразы: «Ближайшее — перезарядить огнетушитель».
// Аббревиатуры («ЕФС-1», «СОУТ») оставляем как есть.
export function inSentence(title) {
  const t = String(title || '').replace(/\.$/, '');
  return t.length > 1 && t[1] === t[1].toLowerCase() ? t[0].toLowerCase() + t.slice(1) : t;
}