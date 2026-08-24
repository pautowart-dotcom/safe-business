import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, ST, BackBtn, Field, TextInput, Select, Btn, Badge, Icon, C, F } from '../ui/components.jsx';
import { TrendLineChart, StatTile, StackedBarBreakdown, DonutBreakdown, VerticalBarChart, Sparkline, CHART_COLORS, compactMoney } from '../ui/charts.jsx';
import useIsDesktop from '../hooks/useIsDesktop.js';
import { localDateStr } from '../utils/localDate.js';
import { nicheLabel } from '../utils/niches.js';

const PERIOD_PRESETS = [['today', 'Сегодня'], ['week', 'Неделя'], ['month', 'Месяц'], ['lastMonth', 'Прошлый месяц']];
const EMPTY_EXPENSE_FORM = { name: '', amount: '', occurredAt: '', category: '', channel: '' };
const EMPTY_RECURRING_FORM = { name: '', kind: 'fixed', amount: '', category: '', channel: '' };
const EMPTY_ADJUSTMENT_FORM = { masterMembershipId: '', amount: '', comment: '', occurredAt: '' };
const EMPTY_REVENUE_FORM = { amount: '', membershipId: '', comment: '', occurredAt: '' };

const PAYMENT_METHOD_LABELS = { cash: 'Наличные', card: 'Карта', transfer: 'Перевод', package: 'Абонемент', other: 'Другое', unspecified: 'Не указан' };

// Этап 0 плана аналитики (15.08.2026) — фиксированный список категорий
// расходов, ключи совпадают с CHECK-констрейнтом миграции 0080.
const EXPENSE_CATEGORIES = [
  ['advertising', 'Реклама'],
  ['supplies', 'Расходники'],
  ['rent', 'Аренда'],
  ['utilities', 'Коммунальные'],
  ['accounting_legal', 'Бухгалтерия/юрист'],
  ['equipment_repair', 'Оборудование/ремонт'],
  ['other', 'Прочее'],
];
const EXPENSE_CATEGORY_LABELS = Object.fromEntries(EXPENSE_CATEGORIES);
EXPENSE_CATEGORY_LABELS.uncategorized = 'Без категории';

// Подсказки канала — свободный ввод (datalist), не жёсткий список: решение
// 15.08.2026 было "не ограничивать нестандартные случаи".
const AD_CHANNEL_SUGGESTIONS = ['Instagram', 'Яндекс Директ', 'ВКонтакте', 'Листовки/наружка', 'Блогер/коллаборация', 'Яндекс.Карты/2ГИС', 'Сарафанное радио'];
const AD_CHANNEL_LABELS = { unspecified: 'Канал не указан' };

function money(v) {
  return `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
}

function todayStr() {
  return localDateStr();
}

// Дублирует календарную логику backend/src/modules/finance/summary.routes.js
// (resolvePeriod) — экрану мастера period.from/to сервер не отдаёт (нет
// вызова /summary), поэтому диапазон для /visits и /finance/adjustments
// считается тем же способом на клиенте.
// toDateStr раньше был d.toISOString().slice(0, 10) — для start/end,
// сконструированных как new Date(y, m, d) (местная полночь), toISOString
// уводил календарный день на сутки назад при положительном часовом поясе
// (Москва, UTC+3) ВСЕГДА, а не только у полуночи: "Месяц" начинался с
// последнего дня предыдущего месяца. localDateStr берёт локальные
// год/месяц/день без конвертации в UTC.
function computePeriodRange(preset, customFrom, customTo) {
  const today = new Date();

  if (preset === 'custom') {
    return { from: customFrom, to: customTo };
  }
  if (preset === 'lastMonth') {
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { from: localDateStr(start), to: localDateStr(end) };
  }
  if (preset === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: localDateStr(start), to: localDateStr(today) };
  }
  if (preset === 'week') {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { from: localDateStr(start), to: localDateStr(today) };
  }
  return { from: localDateStr(today), to: localDateStr(today) };
}

function usePeriodParams() {
  const [preset, setPreset] = useState('month');
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());
  const ready = preset !== 'custom' || (customFrom && customTo);
  const params = preset === 'custom' ? { dateFrom: customFrom, dateTo: customTo } : { period: preset };
  return { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, ready, params };
}

function PeriodBar({ preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo }) {
  const isCustom = preset === 'custom';
  const isDesktop = useIsDesktop();
  // Баг №10: flex:1 на 5 кнопках без переноса/прокрутки заставлял их делить
  // ширину строки поровну независимо от длины текста ("Прошлый месяц" не
  // помещался) — на узком экране кнопки сжимались и наезжали друг на друга,
  // так что переключение периодов переставало нормально нажиматься.
  // flexWrap переносит лишние кнопки на вторую строку вместо сжатия.
  const tabStyle = (active) => ({
    padding: '8px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: F,
    background: active ? C.bg : 'transparent', color: active ? C.primary : C.subtle,
    fontSize: 12, fontWeight: active ? 700 : 400, boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
    whiteSpace: 'nowrap',
  });
  return (
    <div style={{ marginBottom: 16 }}>
      {/* На десктопе (23.08.2026) сегменты больше не растягиваются
          space-between на всю ширину — это выглядело как разбросанные по
          экрану кнопки с пустотой между ними на широком мониторе (см.
          скриншот владельца). Плотный ряд слева, как нативный сегментный
          переключатель на Маке, вместо растянутого на всю ширину. На
          телефоне поведение не тронуто. */}
      {/* "Даты" раньше была пятой кнопкой в этом же ряду — при переносе на
          вторую строку (flexWrap) оставалась там одна, с пустым местом
          рядом (не нравилось владельцу). Вынесена отдельной строкой-ссылкой
          под сегментами — так у 4 пресетов ровный ряд, а свой период не
          ломает раскладку, даже если сам заголовок "Даты" короче остальных. */}
      <div style={{ display: isDesktop ? 'inline-flex' : 'flex', flexWrap: 'wrap', justifyContent: isDesktop ? 'flex-start' : 'space-between', gap: 4, background: C.surface, borderRadius: 12, padding: 3 }}>
        {PERIOD_PRESETS.map(([k, l]) => (
          <button key={k} onClick={() => setPreset(k)} style={tabStyle(preset === k)}>{l}</button>
        ))}
      </div>
      <button
        onClick={() => setPreset('custom')}
        style={{ display: 'block', marginLeft: isDesktop ? 0 : 'auto', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, padding: '10px 2px 0', fontSize: 12, fontWeight: isCustom ? 700 : 500, color: isCustom ? C.primary : C.subtle }}
      >
        {isCustom ? 'Свой период ✓' : 'Указать даты вручную ›'}
      </button>
      {isCustom && (
        // Баг (13.08.2026, скриншот владельца): flex:1 + minWidth:0 не
        // помог до конца — нативный виджет type="date" на части браузеров
        // (Windows) всё равно продавливает свою "естественную" ширину сквозь
        // flex-basis, и второе поле вылезало за пределы карточки целиком.
        // CSS Grid с explicit minmax(0,1fr) на обеих колонках жёстче:
        // верхняя граница ширины колонки задана треком (1fr), а minmax(0,…)
        // явно снимает автоматический "не сжимать меньше содержимого" минимум
        // на уровне грида, а не на уровне самого поля — надёжнее для
        // родных виджетов, чем flex+minWidth:0.
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8, marginTop: 8 }}>
          <TextInput type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <TextInput type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}
    </div>
  );
}

function ExpRow({ label, value, onEdit, onDel }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 14 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{value}</span>
        {onEdit && (
          <button onClick={onEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
            <Icon name="edit" size={13} color={C.secondary} />
          </button>
        )}
        {onDel && (
          <button onClick={onDel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
            <Icon name="trash" size={14} color={C.red} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function Finance() {
  const { isManagement } = useAuth();
  return isManagement ? <OwnerFinance /> : <MasterFinance />;
}

// ---------- Владелец ----------

function OwnerFinance() {
  const isDesktop = useIsDesktop();
  const period = usePeriodParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'overview');
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [shiftForm, setShiftForm] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [masters, setMasters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expenseForm, setExpenseForm] = useState(null);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [recurringForm, setRecurringForm] = useState(null);
  const [editingRecurringId, setEditingRecurringId] = useState(null);
  const [selectedMaster, setSelectedMaster] = useState(null);
  const [adjustmentForm, setAdjustmentForm] = useState(null);
  const [revenueForm, setRevenueForm] = useState(null);
  // Тренды (05.08.2026) — независимы от выбора периода вверху (тот
  // управляет "Обзором"/"По мастерам"), всегда последние 12 месяцев.
  const [trends, setTrends] = useState(null);
  const [trendsError, setTrendsError] = useState('');
  // Этап 1 плана аналитики (15.08.2026) — метрики без новых полей БД, следуют
  // тому же выбору периода, что "Обзор"/"По мастерам" (в отличие от trends,
  // которые всегда за последние 12 мес независимо от периода).
  const [insights, setInsights] = useState(null);
  const [insightsError, setInsightsError] = useState('');
  // Каталог услуг (24.08.2026, карточка "Активные услуги" на десктопе) — не
  // зависит от выбранного периода (это не продажи, а сам каталог), поэтому
  // отдельный эффект, не часть load(). Модуль "Визиты" — тот же гейт, что и
  // у самого эндпоинта на бэкенде (requireModule('visits'), visits/index.js) —
  // без него запрос ответит 403, не дёргаем его вовсе, если модуль выключен.
  const { hasModule } = useAuth();
  const [services, setServices] = useState(null);
  useEffect(() => {
    if (!hasModule('visits')) { setServices([]); return; }
    api.get('/modules/visits/services').then((res) => setServices(res.data)).catch(() => setServices([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load() {
    if (!period.ready) return Promise.resolve();
    return api
      .get('/modules/finance/summary', { params: period.params })
      .then((res) => {
        setSummary(res.data);
        return Promise.all([
          api.get('/modules/finance/expenses', { params: { dateFrom: res.data.period.from, dateTo: res.data.period.to } }),
          api.get('/modules/finance/adjustments', { params: { dateFrom: res.data.period.from, dateTo: res.data.period.to } }),
          api.get('/modules/finance/revenue', { params: { dateFrom: res.data.period.from, dateTo: res.data.period.to } }),
          api.get('/modules/finance/shifts', { params: { dateFrom: res.data.period.from, dateTo: res.data.period.to } }),
        ]);
      })
      .then(([exp, adj, rev, sh]) => {
        setExpenses(exp.data);
        setAdjustments(adj.data);
        setRevenue(rev.data);
        setShifts(sh.data);
      })
      .finally(() => setLoading(false));
  }
  function loadRecurring() {
    return api.get('/modules/finance/recurring-expenses').then((res) => setRecurring(res.data));
  }
  function loadTrends() {
    setTrendsError('');
    return api
      .get('/modules/finance/summary/trends', { params: { months: 12 } })
      .then((res) => setTrends(res.data.trends))
      .catch((err) => setTrendsError(err.response?.data?.error || err.message || 'Не удалось загрузить аналитику'));
  }
  function loadInsights() {
    if (!period.ready) return Promise.resolve();
    setInsightsError('');
    return api
      .get('/modules/finance/summary/insights', { params: period.params })
      .then((res) => setInsights(res.data))
      .catch((err) => setInsightsError(err.response?.data?.error || err.message || 'Не удалось загрузить аналитику'));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
    loadInsights();
  }, [period.preset, period.customFrom, period.customTo]);
  useEffect(() => {
    loadRecurring();
  }, []);
  useEffect(() => {
    loadTrends();
  }, []);
  usePullToRefresh(() => Promise.all([load(), loadRecurring(), loadTrends(), loadInsights()]));
  useEffect(() => {
    api.get('/platform/memberships').then((res) => setMasters(res.data.filter((m) => m.role === 'master' && m.user_id)));
  }, []);

  // Вкладка и выбранный мастер живут в URL (?tab=masters&master=<id>), а не
  // только в useState. Раньше клик по визиту в "По мастерам" уводил на
  // /visits новым переходом, и кнопка "назад" возвращала на голый /finance —
  // компонент монтировался заново с tab по умолчанию ("Обзор"), теряя, что
  // владелец был именно в разборе конкретного мастера. Этот эффект — источник
  // истины: и восстанавливает состояние при возврате назад, и обнуляет его,
  // если владелец повторно нажимает вкладку "Финансы" внизу (та ведёт на
  // голый /finance без параметров).
  useEffect(() => {
    const urlTab = searchParams.get('tab') || 'overview';
    setTab(urlTab);
    const masterParam = searchParams.get('master');
    if (urlTab !== 'masters' || !masterParam) {
      setSelectedMaster(null);
    } else if (summary) {
      const found = summary.byMaster.find((m) => String(m.masterMembershipId) === masterParam);
      setSelectedMaster(found || null);
    }
  }, [searchParams, summary]);

  function changeTab(k) {
    setSearchParams(k === 'overview' ? {} : { tab: k }, { replace: true });
  }
  function selectMaster(m) {
    setSearchParams({ tab: 'masters', master: String(m.masterMembershipId) }, { replace: true });
  }
  function backFromMaster() {
    setSearchParams({ tab: 'masters' }, { replace: true });
  }

  function openAddRecurring(kind) {
    setEditingRecurringId(null);
    setRecurringForm({ ...EMPTY_RECURRING_FORM, kind });
  }
  function openEditRecurring(r) {
    setEditingRecurringId(r.id);
    setRecurringForm({ name: r.name, kind: r.kind, amount: String(r.amount), category: r.category || '', channel: r.channel || '' });
  }
  function closeRecurringForm() {
    setRecurringForm(null);
    setEditingRecurringId(null);
  }
  async function submitRecurring(e) {
    e.preventDefault();
    if (!recurringForm.name) return;
    if (editingRecurringId) await api.patch(`/modules/finance/recurring-expenses/${editingRecurringId}`, recurringForm);
    else await api.post('/modules/finance/recurring-expenses', recurringForm);
    closeRecurringForm();
    loadRecurring();
    load();
  }
  async function deleteRecurring(id) {
    await api.delete(`/modules/finance/recurring-expenses/${id}`);
    loadRecurring();
    load();
  }

  function openAddExpense() {
    setEditingExpenseId(null);
    setExpenseForm(EMPTY_EXPENSE_FORM);
  }
  function openEditExpense(e) {
    setEditingExpenseId(e.id);
    setExpenseForm({ name: e.name, amount: String(e.amount), occurredAt: (e.occurred_at || '').slice(0, 10), category: e.category || '', channel: e.channel || '' });
  }
  function closeExpenseForm() {
    setExpenseForm(null);
    setEditingExpenseId(null);
  }
  async function submitExpense(e) {
    e.preventDefault();
    if (!expenseForm.name) return;
    if (editingExpenseId) await api.patch(`/modules/finance/expenses/${editingExpenseId}`, expenseForm);
    else await api.post('/modules/finance/expenses', expenseForm);
    closeExpenseForm();
    load();
  }
  async function deleteExpense(id) {
    await api.delete(`/modules/finance/expenses/${id}`);
    load();
  }

  function openAddRevenue() {
    setRevenueForm(EMPTY_REVENUE_FORM);
  }
  function closeRevenueForm() {
    setRevenueForm(null);
  }
  async function submitRevenue(e) {
    e.preventDefault();
    if (!revenueForm.amount) return;
    await api.post('/modules/finance/revenue', revenueForm);
    closeRevenueForm();
    load();
  }
  async function deleteRevenue(id) {
    await api.delete(`/modules/finance/revenue/${id}`);
    load();
  }

  async function submitAdjustment(e) {
    e.preventDefault();
    if (!adjustmentForm.amount || !adjustmentForm.comment.trim()) return;
    await api.post('/modules/finance/adjustments', adjustmentForm);
    setAdjustmentForm(null);
    load();
  }
  async function deleteAdjustment(id) {
    await api.delete(`/modules/finance/adjustments/${id}`);
    load();
  }

  async function submitShift(e) {
    e.preventDefault();
    if (!shiftForm.shiftDate) return;
    await api.post('/modules/finance/shifts', shiftForm);
    setShiftForm(null);
    load();
  }
  async function deleteShift(id) {
    await api.delete(`/modules/finance/shifts/${id}`);
    load();
  }

  if (loading || !summary) return <div className="page-loading">Загрузка...</div>;

  if (selectedMaster) {
    return <MasterDetailView master={selectedMaster} dateFrom={summary.period.from} dateTo={summary.period.to} onBack={backFromMaster} />;
  }

  const adjustmentsByMaster = {};
  for (const a of adjustments) (adjustmentsByMaster[a.master_membership_id] ||= []).push(a);
  const shiftsByMaster = {};
  for (const s of shifts) (shiftsByMaster[s.master_membership_id] ||= []).push(s);

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Финансы</div>
      <PeriodBar {...period} />

      <div style={{ display: isDesktop ? 'inline-flex' : 'flex', background: C.surface, borderRadius: 12, padding: 3, marginBottom: 16 }}>
        {[['overview', 'Обзор'], ['masters', 'По мастерам'], ['analytics', 'Аналитика']].map(([k, l]) => (
          <button
            key={k}
            onClick={() => changeTab(k)}
            style={{ flex: isDesktop ? 'none' : 1, padding: isDesktop ? '9px 18px' : '9px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: F, background: tab === k ? C.bg : 'transparent', color: tab === k ? C.primary : C.subtle, fontSize: 13, fontWeight: tab === k ? 700 : 400, boxShadow: tab === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab
          summary={summary}
          recurring={recurring}
          expenses={expenses}
          revenue={revenue}
          masters={masters}
          revenueForm={revenueForm}
          setRevenueForm={setRevenueForm}
          openAddRevenue={openAddRevenue}
          closeRevenueForm={closeRevenueForm}
          submitRevenue={submitRevenue}
          deleteRevenue={deleteRevenue}
          recurringForm={recurringForm}
          setRecurringForm={setRecurringForm}
          editingRecurringId={editingRecurringId}
          openAddRecurring={openAddRecurring}
          openEditRecurring={openEditRecurring}
          closeRecurringForm={closeRecurringForm}
          submitRecurring={submitRecurring}
          deleteRecurring={deleteRecurring}
          expenseForm={expenseForm}
          setExpenseForm={setExpenseForm}
          editingExpenseId={editingExpenseId}
          openAddExpense={openAddExpense}
          openEditExpense={openEditExpense}
          closeExpenseForm={closeExpenseForm}
          submitExpense={submitExpense}
          deleteExpense={deleteExpense}
          trends={trends}
          services={services}
        />
      )}
      {tab === 'masters' && (
        <MastersTab
          byMaster={summary.byMaster}
          masters={masters}
          adjustmentsByMaster={adjustmentsByMaster}
          shiftsByMaster={shiftsByMaster}
          onSelectMaster={selectMaster}
          onAddAdjustment={(m) => setAdjustmentForm({ ...EMPTY_ADJUSTMENT_FORM, masterMembershipId: m.masterMembershipId })}
          onDeleteAdjustment={deleteAdjustment}
          onAddShift={(m) => setShiftForm({ masterMembershipId: m.masterMembershipId, shiftDate: todayStr(), payoutAmount: '' })}
          onDeleteShift={deleteShift}
        />
      )}
      {tab === 'analytics' && (
        <AnalyticsTab trends={trends} error={trendsError} insights={insights} insightsError={insightsError} byMaster={summary.byMaster} />
      )}

      {adjustmentForm && (
        <AdjustmentModal form={adjustmentForm} setForm={setAdjustmentForm} masters={masters} onSubmit={submitAdjustment} onClose={() => setAdjustmentForm(null)} />
      )}
      {shiftForm && (
        <ShiftModal form={shiftForm} setForm={setShiftForm} masters={masters} onSubmit={submitShift} onClose={() => setShiftForm(null)} />
      )}
    </div>
  );
}

function RevenueRow({ entry, onDelete }) {
  const isAuto = entry.source === 'auto_from_visit';
  const label = isAuto ? `Авто · Визит №${entry.visit_id}` : 'Вручную';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <Badge color={isAuto ? C.subtle : C.orange} bg={isAuto ? C.surface : C.orangeBg}>{label}</Badge>
          <span style={{ fontSize: 12, color: C.subtle }}>{new Date(entry.occurred_at).toLocaleDateString('ru-RU')}</span>
        </div>
        <div style={{ fontSize: 13 }}>{entry.master_name || 'Без сотрудника'}{entry.comment ? ` · ${entry.comment}` : ''}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{money(entry.amount)}</span>
        {!isAuto && onDelete && (
          <button onClick={() => onDelete(entry.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
            <Icon name="trash" size={14} color={C.red} />
          </button>
        )}
      </div>
    </div>
  );
}

function RevenueForm({ form, setForm, masters, onSubmit, onCancel }) {
  return (
    <form onSubmit={onSubmit} style={{ background: C.surface, borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <Field label="Сумма ₽">
        <TextInput type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ background: C.bg }} />
      </Field>
      <Field label="Сотрудник (необязательно)">
        <Select value={form.membershipId} onChange={(e) => setForm({ ...form, membershipId: e.target.value })} style={{ background: C.bg }}>
          <option value="">Без сотрудника</option>
          {masters.map((m) => (
            <option key={m.id} value={m.id}>{m.user_name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Комментарий (необязательно)">
        <TextInput value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Например: наличная выручка за день" style={{ background: C.bg }} />
      </Field>
      <Field label="Дата">
        <TextInput type="date" value={form.occurredAt || todayStr()} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} style={{ background: C.bg }} />
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn small type="submit">Добавить</Btn>
        <Btn small type="button" variant="secondary" onClick={onCancel}>Отмена</Btn>
      </div>
    </form>
  );
}

// Строка П&Л: без sign — просто строка (выручка), с sign="−" — вычитаемая
// статья расходов. По просьбе владельца (04.08.2026) заменили плитки-грид на
// понятный "сверху вниз": видно, как выручка превращается в прибыль, не
// нужно складывать числа в уме.
// 16.08.2026: списки вроде "Выручка" за месяц у активной студии легко
// доходят до 50-100+ строк (по одной на визит) — рендерить и листать всё
// сразу было медленно и долго на телефоне. Показываем первую страницу
// (по умолчанию 6 — свёрнутый вид должен помещаться на экран без
// скролла), дальше простое переключение "Показать ещё" ⇄ "Свернуть", не
// накопительная догрузка — так всегда можно вернуться к короткому виду,
// не только листать дальше.
function ShowMoreList({ items, pageSize = 6, renderItem, emptyText }) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) {
    return emptyText ? <div style={{ padding: '10px 0', textAlign: 'center', color: C.subtle, fontSize: 13 }}>{emptyText}</div> : null;
  }
  const visible = expanded ? items : items.slice(0, pageSize);
  return (
    <>
      {visible.map(renderItem)}
      {items.length > pageSize && (
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{ display: 'block', width: '100%', textAlign: 'center', background: 'none', border: 'none', color: C.primary, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '10px 0 0' }}
        >
          {expanded ? 'Свернуть' : `Показать ещё (${items.length - pageSize})`}
        </button>
      )}
    </>
  );
}

function PnlRow({ label, value, sign }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0' }}>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{sign ? `${sign} ${label}` : label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{money(value)}</div>
    </div>
  );
}

function OverviewTab({
  summary, recurring, expenses, revenue, masters,
  revenueForm, setRevenueForm, openAddRevenue, closeRevenueForm, submitRevenue, deleteRevenue,
  recurringForm, setRecurringForm, editingRecurringId, openAddRecurring, openEditRecurring, closeRecurringForm, submitRecurring, deleteRecurring,
  expenseForm, setExpenseForm, editingExpenseId, openAddExpense, openEditExpense, closeExpenseForm, submitExpense, deleteExpense,
  trends, services,
}) {
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  // На десктопе (23.08.2026) карточка П&Л на всю ширину читалась как один
  // растянутый тёмный блок с огромными пустыми промежутками между надписью и
  // суммой (живой скриншот владельца) — сама по себе карточка не менялась,
  // просто раньше не было ограничения по ширине. Стат-ряд сверху даёт
  // "картину одним взглядом", а весь список карточек ниже (включая ту же
  // П&Л-карточку) идёт в адаптивную сетку — тот же приём, что уже
  // сработал на "Главной", здесь просто применён к тому же самому JSX.
  //
  // 23.08.2026, второй проход: "колхозно" (владелец) — просто разложить те
  // же карточки по сетке было мало, нужен настоящий контент, которого не
  // было в "Обзоре". Тренд-график и разбивка расходов по структуре уже были
  // построены для вкладки "Аналитика" (AnalyticsTab ниже) — тот же
  // TrendLineChart/StackedBarBreakdown, те же данные (trends уже
  // загружаются в OwnerFinance независимо от вкладки), просто на "Обзоре"
  // их не было видно, пока не переключишься на "Аналитику". Дублировать
  // здесь не считаю проблемой — эти графики о другом, чем построчный П&Л
  // ниже (тренд по месяцам vs текущий период), и оба взгляда уместны.
  const totalExpenses = (summary.masterSalaries || 0) + (summary.fixedExpenses || 0) + (summary.percentExpenses || 0) + (summary.variableExpenses || 0) + (summary.materialsCost || 0);
  const hasTrends = isDesktop && trends && trends.length >= 2;
  const trendCurr = hasTrends ? trends[trends.length - 1] : null;
  const trendPrev = hasTrends ? trends[trends.length - 2] : null;
  const trendHasProfit = hasTrends && trendCurr.netProfit !== undefined;
  const revenueDelta = hasTrends ? pctChange(trendCurr.revenue, trendPrev.revenue) : null;
  const profitDelta = trendHasProfit ? pctChange(trendCurr.netProfit, trendPrev.netProfit) : null;
  const chartPoints = hasTrends
    ? trends.map((t) => ({ x: monthLabel(t.month), values: trendHasProfit ? { revenue: t.revenue, netProfit: t.netProfit } : { revenue: t.revenue } }))
    : null;
  const chartSeries = trendHasProfit
    ? [{ key: 'revenue', label: 'Выручка', color: CHART_COLORS.blue }, { key: 'netProfit', label: 'Прибыль', color: CHART_COLORS.orange }]
    : [{ key: 'revenue', label: 'Выручка', color: CHART_COLORS.blue }];
  const structureSegments = [
    { key: 'salaries', label: 'Зарплаты', value: summary.masterSalaries || 0, color: CHART_COLORS.blue },
    { key: 'fixed', label: 'Пост. расходы', value: summary.fixedExpenses || 0, color: CHART_COLORS.orange },
    { key: 'percent', label: '% расходы', value: summary.percentExpenses || 0, color: CHART_COLORS.aqua },
    { key: 'variable', label: 'Перем. расходы', value: summary.variableExpenses || 0, color: CHART_COLORS.yellow },
  ];
  const categoryColorCycle = [CHART_COLORS.blue, CHART_COLORS.orange, CHART_COLORS.aqua, CHART_COLORS.yellow];

  // Поиск по спискам — новое (24.08.2026, по референсу YooKassa: "История
  // платежей" там ищет по имени/сумме/статусу над самой таблицей). Только
  // десктоп — фильтрует уже загруженные за период данные на клиенте, без
  // нового запроса к API. На телефоне списки короче (один экран прокрутки),
  // поиск там не так нужен, оставлен как есть.
  const [revenueSearch, setRevenueSearch] = useState('');
  const [expenseSearch, setExpenseSearch] = useState('');
  const filteredRevenue = revenueSearch.trim()
    ? revenue.filter((r) => `${r.master_name || ''} ${r.comment || ''}`.toLowerCase().includes(revenueSearch.trim().toLowerCase()))
    : revenue;
  const filteredExpenses = expenseSearch.trim()
    ? expenses.filter((e) => `${e.name || ''} ${EXPENSE_CATEGORY_LABELS[e.category] || ''} ${e.channel || ''}`.toLowerCase().includes(expenseSearch.trim().toLowerCase()))
    : expenses;

  return (
    <div>
      {isDesktop && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 16 }}>
          <StatTile
            label="Выручка за период"
            value={money(summary.revenue)}
            delta={revenueDelta != null ? `${revenueDelta >= 0 ? '+' : ''}${revenueDelta}%` : null}
            deltaGood={revenueDelta != null ? revenueDelta >= 0 : null}
            trend={hasTrends ? trends.map((t) => t.revenue) : null}
            trendColor={CHART_COLORS.blue}
            icon={<Icon name="finance" size={13} color={CHART_COLORS.blue} sw={2} />}
            iconBg={C.blueBg}
          />
          <StatTile
            label="Расходы за период"
            value={money(totalExpenses)}
            icon={<Icon name="doc" size={13} color={CHART_COLORS.orange} sw={1.8} />}
            iconBg={C.orangeBg}
          />
          {summary.netProfit != null && (
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: C.subtle }}>Чистая прибыль</div>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: summary.netProfit >= 0 ? C.greenBg : C.redBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={summary.netProfit >= 0 ? 'trendUp' : 'trendDown'} size={13} color={summary.netProfit >= 0 ? C.green : C.red} sw={2} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: summary.netProfit >= 0 ? C.primary : C.red }}>{money(summary.netProfit)}</div>
                  {profitDelta != null && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: profitDelta >= 0 ? C.green : C.red }}>{profitDelta >= 0 ? '+' : ''}{profitDelta}%</div>
                  )}
                </div>
                {trendHasProfit && <Sparkline values={trends.map((t) => t.netProfit)} color={CHART_COLORS.orange} />}
              </div>
            </div>
          )}
          <StatTile
            label="Услуг за период"
            value={summary.visitsCount ?? 0}
            icon={<Icon name="visit" size={13} color={CHART_COLORS.aqua} sw={1.8} />}
            iconBg="#e6f7f1"
          />
        </div>
      )}

      {/* График и структура расходов рядом, не друг под другом — график
          важнее и шире (2/3), структура — компактная боковая карточка (1/3),
          тот же приём, что у Stripe/Mercury-стиля дашбордов: главный график
          не делит внимание поровну со вспомогательной разбивкой. */}
      {isDesktop && (chartPoints || (summary.netProfit != null && totalExpenses > 0)) && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'stretch' }}>
          {chartPoints && (
            <Card style={{ flex: 2, minWidth: 0, marginBottom: 0 }}>
              <ST>Выручка{trendHasProfit ? ' и прибыль' : ''} по месяцам</ST>
              <TrendLineChart points={chartPoints} series={chartSeries} formatY={compactMoney} />
            </Card>
          )}
          {summary.netProfit != null && totalExpenses > 0 && (
            <Card style={{ flex: 1, minWidth: 0, marginBottom: 0 }}>
              <ST>Структура расходов</ST>
              <DonutBreakdown segments={structureSegments} centerSublabel="Всего расходов" />
            </Card>
          )}
        </div>
      )}

      {/* Три тёмные карточки — по референсу владельца. Только реальные
          данные: "Остаток на конец" и "Новые клиенты" из мокапа сюда
          сознательно не попали — у нас нет ни текущего остатка на счёте
          (только П&Л за период), ни счётчика новых клиентов на этом экране,
          выдумывать эти цифры нельзя. "Активные услуги" — из настоящего
          каталога (GET /modules/visits/services), не заглушка. */}
      {isDesktop && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220, background: C.primary, borderRadius: 12, padding: 18, color: '#FFF' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 10 }}>Ключевые показатели</div>
            {[
              ['Услуг за период', summary.visitsCount ?? 0],
              ['Выручка', money(summary.revenue)],
              ['Средний чек', money(summary.visitsCount > 0 ? Math.round(summary.revenue / summary.visitsCount) : 0)],
              ['Расходы за период', money(totalExpenses)],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13 }}>
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</span>
                <span style={{ fontWeight: 700 }}>{value}</span>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: 220, background: C.primary, borderRadius: 12, padding: 18, color: '#FFF' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 10 }}>Движение денежных средств</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13 }}>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>Поступления</span>
              <span style={{ fontWeight: 700, color: '#4ADE80' }}>+{money(summary.revenue)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13 }}>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>Выплаты</span>
              <span style={{ fontWeight: 700, color: '#FCA5A5' }}>−{money(totalExpenses)}</span>
            </div>
            {summary.netProfit != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13, borderTop: '1px solid rgba(255,255,255,0.15)', marginTop: 4 }}>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>Чистый поток</span>
                <span style={{ fontWeight: 800, color: summary.netProfit >= 0 ? '#4ADE80' : '#FCA5A5' }}>{money(summary.netProfit)}</span>
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 220, background: C.primary, borderRadius: 12, padding: 18, color: '#FFF' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>Активные услуги{services ? ` · ${services.length}` : ''}</div>
              <button onClick={() => navigate('/services')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, padding: '4px 8px', color: '#FFF', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>+ Добавить</button>
            </div>
            {services === null ? (
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)' }}>Загрузка...</div>
            ) : services.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '14px 0' }}>Нет активных услуг</div>
            ) : (
              services.slice(0, 4).map((s) => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13 }}>
                  <span style={{ color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 10 }}>{s.name}</span>
                  <span style={{ fontWeight: 700, flexShrink: 0 }}>{s.approx_price != null ? money(s.approx_price) : '—'}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div style={isDesktop ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, alignItems: 'start' } : undefined}>
      <div style={{ background: C.primary, borderRadius: 16, padding: 20, marginBottom: 12, color: '#FFF' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0 10px' }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Услуг за период</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{summary.visitsCount ?? 0}</div>
        </div>
        <PnlRow label="Выручка" value={summary.revenue} />
        <PnlRow label="Зарплаты" value={summary.masterSalaries} sign="−" />
        <PnlRow label="Пост. расходы" value={summary.fixedExpenses} sign="−" />
        <PnlRow label="% расходы" value={summary.percentExpenses} sign="−" />
        <PnlRow label="Перем. расходы" value={summary.variableExpenses} sign="−" />
        {summary.materialsCost != null && <PnlRow label="Материалы (по факту списания)" value={summary.materialsCost} sign="−" />}
        {summary.netProfit != null && (
          <>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.25)', margin: '12px 0 10px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>= Чистая прибыль</div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-1px', color: summary.netProfit >= 0 ? '#FFF' : '#FCA5A5' }}>{money(summary.netProfit)}</div>
            </div>
          </>
        )}
      </div>
      {summary.materialsCost === 0 && (
        <div style={{ fontSize: 12, color: C.subtle, marginTop: -8, marginBottom: 12, padding: '0 4px' }}>
          Себестоимость материалов — 0 ₽: скорее всего, у расходников на складе ещё не указаны закупочные цены (Склад расходников → Изменить), а не потому что они бесплатны.
        </div>
      )}

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <ST>Выручка</ST>
          <button onClick={openAddRevenue} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <Icon name="plus" size={18} color={C.primary} />
          </button>
        </div>
        {revenueForm && (
          <RevenueForm form={revenueForm} setForm={setRevenueForm} masters={masters} onSubmit={submitRevenue} onCancel={closeRevenueForm} />
        )}
        {isDesktop && revenue.length > 5 && (
          <input
            value={revenueSearch}
            onChange={(e) => setRevenueSearch(e.target.value)}
            placeholder="Поиск по сотруднику или комментарию"
            style={{ width: '100%', boxSizing: 'border-box', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12.5, marginBottom: 10, outline: 'none' }}
          />
        )}
        <ShowMoreList
          items={filteredRevenue}
          emptyText={revenueSearch.trim() ? 'Ничего не найдено' : 'Записей о выручке за период нет'}
          renderItem={(r) => <RevenueRow key={r.id} entry={r} onDelete={deleteRevenue} />}
        />
        {summary.unassignedRevenue > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', marginTop: 4, fontSize: 12, color: C.subtle }}>
            <span>из них без сотрудника</span>
            <span>{money(summary.unassignedRevenue)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', marginTop: 4, borderTop: `2px solid ${C.border}` }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.subtle }}>Итого</span>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{money(summary.revenue)}</span>
        </div>
      </Card>

      {summary.byPaymentMethod && (
        <Card>
          <ST>Выручка по способу оплаты (визиты)</ST>
          {summary.byPaymentMethod.map((row) => (
            <div key={row.method} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13 }}>
              <span style={{ color: C.secondary }}>{PAYMENT_METHOD_LABELS[row.method] || row.method} <span style={{ color: C.subtle }}>· {row.visitsCount}</span></span>
              <span style={{ fontWeight: 700 }}>{money(row.revenue)}</span>
            </div>
          ))}
          {summary.byPaymentMethod.length === 0 && <div style={{ fontSize: 13, color: C.subtle }}>Визитов за период нет</div>}
        </Card>
      )}

      {/* Только когда в визитах реально указана ниша (студия отмечает
          услугу по нескольким нишам) — для одно-нишевых студий блок
          молчит сам, без отдельной проверки числа ниш компании. */}
      {summary.byNiche && summary.byNiche.length > 0 && (
        <Card>
          <ST>Выручка по нише</ST>
          {summary.byNiche.map((row) => (
            <div key={row.niche} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13 }}>
              <span style={{ color: C.secondary }}>{nicheLabel(row.niche)} <span style={{ color: C.subtle }}>· {row.visitsCount}</span></span>
              <span style={{ fontWeight: 700 }}>{money(row.revenue)}</span>
            </div>
          ))}
        </Card>
      )}

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <ST>Постоянные расходы</ST>
          <button onClick={() => openAddRecurring('fixed')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <Icon name="plus" size={18} color={C.primary} />
          </button>
        </div>
        {recurringForm && recurringForm.kind === 'fixed' && (
          <RecurringForm form={recurringForm} setForm={setRecurringForm} onSubmit={submitRecurring} onCancel={closeRecurringForm} unitLabel="Сумма ₽/мес" editing={!!editingRecurringId} />
        )}
        {recurring.filter((r) => r.kind === 'fixed').map((r) => (
          <ExpRow
            key={r.id}
            label={r.category ? `${r.name} · ${EXPENSE_CATEGORY_LABELS[r.category] || r.category}${r.channel ? ` (${r.channel})` : ''}` : r.name}
            value={money(r.amount)}
            onEdit={() => openEditRecurring(r)}
            onDel={() => deleteRecurring(r.id)}
          />
        ))}
        {!summary.recurringCountedThisPeriod && recurring.some((r) => r.kind === 'fixed') && (
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 4 }}>Учитывается в прибыли только за целый месяц — переключитесь на «Месяц» или «Прошлый месяц»</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', marginTop: 4, borderTop: `2px solid ${C.border}` }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.subtle }}>Итого за период</span>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{money(summary.fixedExpenses)}</span>
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <ST>Расходы в % от выручки</ST>
          <button onClick={() => openAddRecurring('percent')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <Icon name="plus" size={18} color={C.primary} />
          </button>
        </div>
        {recurringForm && recurringForm.kind === 'percent' && (
          <RecurringForm form={recurringForm} setForm={setRecurringForm} onSubmit={submitRecurring} onCancel={closeRecurringForm} unitLabel="% от выручки" editing={!!editingRecurringId} />
        )}
        {recurring.filter((r) => r.kind === 'percent').map((r) => (
          <ExpRow
            key={r.id}
            label={`${r.name} (${r.amount}%)`}
            value={summary.recurringCountedThisPeriod ? money(Math.round((summary.revenue * r.amount) / 100)) : `${r.amount}%`}
            onEdit={() => openEditRecurring(r)}
            onDel={() => deleteRecurring(r.id)}
          />
        ))}
        {!summary.recurringCountedThisPeriod && recurring.some((r) => r.kind === 'percent') && (
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 4 }}>Учитывается в прибыли только за целый месяц — переключитесь на «Месяц» или «Прошлый месяц»</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', marginTop: 4, borderTop: `2px solid ${C.border}` }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.subtle }}>Итого за период</span>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{money(summary.percentExpenses)}</span>
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <ST>Переменные расходы</ST>
          <button onClick={openAddExpense} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <Icon name="plus" size={18} color={C.primary} />
          </button>
        </div>
        {expenseForm && (
          <form onSubmit={submitExpense} style={{ background: C.surface, borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <TextInput placeholder="Название" value={expenseForm.name} onChange={(e) => setExpenseForm({ ...expenseForm, name: e.target.value })} style={{ marginBottom: 8, background: C.bg }} />
            <Select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value, channel: e.target.value === 'advertising' ? expenseForm.channel : '' })} style={{ marginBottom: 8, background: C.bg }}>
              <option value="">Без категории</option>
              {EXPENSE_CATEGORIES.map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </Select>
            {expenseForm.category === 'advertising' && (
              <>
                <TextInput
                  list="ad-channel-suggestions"
                  placeholder="Какая реклама? (Instagram, Директ...)"
                  value={expenseForm.channel}
                  onChange={(e) => setExpenseForm({ ...expenseForm, channel: e.target.value })}
                  style={{ marginBottom: 8, background: C.bg }}
                />
                <datalist id="ad-channel-suggestions">
                  {AD_CHANNEL_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
                </datalist>
              </>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <TextInput type="number" placeholder="Сумма ₽" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} style={{ background: C.bg }} />
              <Btn small type="submit">{editingExpenseId ? 'Сохранить' : 'Добавить'}</Btn>
              <Btn small type="button" variant="secondary" onClick={closeExpenseForm}>Отмена</Btn>
            </div>
          </form>
        )}
        {isDesktop && expenses.length > 5 && (
          <input
            value={expenseSearch}
            onChange={(e) => setExpenseSearch(e.target.value)}
            placeholder="Поиск по названию или категории"
            style={{ width: '100%', boxSizing: 'border-box', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12.5, marginBottom: 10, outline: 'none' }}
          />
        )}
        <ShowMoreList
          items={filteredExpenses}
          emptyText={expenseSearch.trim() ? 'Ничего не найдено' : undefined}
          renderItem={(e) => (
            <ExpRow
              key={e.id}
              label={`${e.name}${e.category ? ` · ${EXPENSE_CATEGORY_LABELS[e.category] || e.category}${e.channel ? ` (${e.channel})` : ''}` : ''} · ${new Date(e.occurred_at).toLocaleDateString('ru-RU')}`}
              value={money(e.amount)}
              onEdit={() => openEditExpense(e)}
              onDel={() => deleteExpense(e.id)}
            />
          )}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', marginTop: 4, borderTop: `2px solid ${C.border}` }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.subtle }}>Итого</span>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{money(summary.variableExpenses)}</span>
        </div>
      </Card>

      {summary.expensesByCategory && summary.expensesByCategory.length > 0 && (
        <Card>
          <ST>Переменные расходы по категориям</ST>
          {isDesktop ? (
            <StackedBarBreakdown
              segments={summary.expensesByCategory.map((row, i) => ({
                key: row.category, label: EXPENSE_CATEGORY_LABELS[row.category] || row.category, value: row.total,
                color: categoryColorCycle[i % categoryColorCycle.length],
              }))}
            />
          ) : (
            summary.expensesByCategory.map((row) => (
              <div key={row.category} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13 }}>
                <span style={{ color: C.secondary }}>{EXPENSE_CATEGORY_LABELS[row.category] || row.category}</span>
                <span style={{ fontWeight: 700 }}>{money(row.total)}</span>
              </div>
            ))
          )}
        </Card>
      )}

      {summary.advertisingByChannel && summary.advertisingByChannel.length > 0 && (
        <Card>
          <ST>Реклама по каналам</ST>
          {isDesktop ? (
            <StackedBarBreakdown
              segments={summary.advertisingByChannel.map((row, i) => ({
                key: row.channel, label: AD_CHANNEL_LABELS[row.channel] || row.channel, value: row.total,
                color: categoryColorCycle[i % categoryColorCycle.length],
              }))}
            />
          ) : (
            summary.advertisingByChannel.map((row) => (
              <div key={row.channel} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13 }}>
                <span style={{ color: C.secondary }}>{AD_CHANNEL_LABELS[row.channel] || row.channel}</span>
                <span style={{ fontWeight: 700 }}>{money(row.total)}</span>
              </div>
            ))
          )}
        </Card>
      )}

      </div>
    </div>
  );
}

function RecurringForm({ form, setForm, onSubmit, onCancel, unitLabel, editing }) {
  return (
    <form onSubmit={onSubmit} style={{ background: C.surface, borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <TextInput placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ marginBottom: 8, background: C.bg }} />
      <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, channel: e.target.value === 'advertising' ? form.channel : '' })} style={{ marginBottom: 8, background: C.bg }}>
        <option value="">Без категории</option>
        {EXPENSE_CATEGORIES.map(([k, l]) => (
          <option key={k} value={k}>{l}</option>
        ))}
      </Select>
      {form.category === 'advertising' && (
        <>
          <TextInput
            list="ad-channel-suggestions-recurring"
            placeholder="Какая реклама? (Instagram, Директ...)"
            value={form.channel}
            onChange={(e) => setForm({ ...form, channel: e.target.value })}
            style={{ marginBottom: 8, background: C.bg }}
          />
          <datalist id="ad-channel-suggestions-recurring">
            {AD_CHANNEL_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
          </datalist>
        </>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <TextInput type="number" placeholder={unitLabel} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ background: C.bg }} />
        <Btn small type="submit">{editing ? 'Сохранить' : 'Добавить'}</Btn>
        <Btn small type="button" variant="secondary" onClick={onCancel}>Отмена</Btn>
      </div>
    </form>
  );
}

function MastersTab({ byMaster, masters, adjustmentsByMaster, shiftsByMaster, onSelectMaster, onAddAdjustment, onDeleteAdjustment, onAddShift, onDeleteShift }) {
  const { masterLabelGenitivePlural } = useAuth();
  return (
    <Card style={{ padding: 0 }}>
      {byMaster.map((m, i) => {
        const adj = adjustmentsByMaster[m.masterMembershipId] || [];
        const adjTotal = adj.reduce((s, a) => s + Number(a.amount), 0);
        const totalPayout = Number(m.earnings) + adjTotal;
        // Смены ("за выход") показываем только мастерам с этим типом
        // оплаты — у остальных earnings уже полностью посчитан по визитам,
        // раздел просто не имеет смысла.
        const masterInfo = masters.find((mm) => String(mm.id) === String(m.masterMembershipId));
        const isShiftPaid = masterInfo?.payout_type === 'shift';
        const shiftRows = shiftsByMaster[m.masterMembershipId] || [];
        return (
          <div key={m.masterMembershipId} style={{ padding: '14px 16px', borderBottom: i < byMaster.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <div onClick={() => onSelectMaster(m)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{m.masterName || '—'}</div>
                <div style={{ fontSize: 12, color: C.subtle }}>
                  {m.visitsCount} визитов · комиссия {money(m.earnings)}
                  {m.revenue > 0 && ` · выручка вручную ${money(m.revenue)}`}
                </div>
              </div>
              <span style={{ fontSize: 20, color: C.border }}>›</span>
            </div>

            {adj.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {adj.map((a) => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: C.subtle, padding: '4px 0' }}>
                    <span>{a.comment} · {new Date(a.occurred_at).toLocaleDateString('ru-RU')}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, color: Number(a.amount) >= 0 ? C.green : C.red }}>{Number(a.amount) >= 0 ? '+' : ''}{money(a.amount)}</span>
                      <button onClick={() => onDeleteAdjustment(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 11 }}>✕</button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {isShiftPaid && shiftRows.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {shiftRows.map((s) => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: C.subtle, padding: '4px 0' }}>
                    <span>Смена {new Date(s.shift_date).toLocaleDateString('ru-RU')}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700 }}>{money(s.payout_amount)}</span>
                      <button onClick={() => onDeleteShift(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 11 }}>✕</button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => onAddAdjustment(m)} style={{ background: 'none', border: 'none', color: C.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>+ Корректировка</button>
                {isShiftPaid && (
                  <button onClick={() => onAddShift(m)} style={{ background: 'none', border: 'none', color: C.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>+ Отметить смену</button>
                )}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>Итого: {money(totalPayout)}</div>
            </div>
          </div>
        );
      })}
      {byMaster.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: C.subtle, fontSize: 14 }}>{masterLabelGenitivePlural} пока нет</div>}
    </Card>
  );
}

function AdjustmentModal({ form, setForm, masters, onSubmit, onClose }) {
  const master = masters.find((m) => String(m.id) === String(form.masterMembershipId));
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, borderRadius: 16, padding: 20, width: '100%', maxWidth: 380 }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Корректировка{master ? `: ${master.user_name}` : ''}</div>
        <form onSubmit={onSubmit}>
          <Field label="Сумма (+ премия, − вычет)">
            <TextInput type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="1000 или -500" />
          </Field>
          <Field label="Комментарий (обязательно)">
            <TextInput value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Премия за месяц" required />
          </Field>
          <Field label="Дата">
            <TextInput type="date" value={form.occurredAt || todayStr()} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} />
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn type="submit">Сохранить</Btn>
            <Btn type="button" variant="secondary" onClick={onClose}>Отмена</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

// Отметка смены для мастеров с оплатой "за выход" (15.08.2026) — сумма
// необязательна, по умолчанию сервер берёт ставку из Команды
// (memberships.shift_payout_amount); поле оставлено на случай разовой
// корректировки (премиальная смена, неполный день и т.п.).
function ShiftModal({ form, setForm, masters, onSubmit, onClose }) {
  const master = masters.find((m) => String(m.id) === String(form.masterMembershipId));
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, borderRadius: 16, padding: 20, width: '100%', maxWidth: 380 }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Смена{master ? `: ${master.user_name}` : ''}</div>
        <form onSubmit={onSubmit}>
          <Field label="Дата смены">
            <TextInput type="date" value={form.shiftDate} onChange={(e) => setForm({ ...form, shiftDate: e.target.value })} required />
          </Field>
          <Field label="Сумма, ₽ (необязательно — по умолчанию ставка мастера)">
            <TextInput type="number" min="0" value={form.payoutAmount} onChange={(e) => setForm({ ...form, payoutAmount: e.target.value })} placeholder={master?.shift_payout_amount ? String(master.shift_payout_amount) : ''} />
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn type="submit">Сохранить</Btn>
            <Btn type="button" variant="secondary" onClick={onClose}>Отмена</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Аналитика (05.08.2026) ----------
// Слой 1 (графики) + слой 2 (автовыводы) из плана — тренд выручки/прибыли,
// средний чек, маржа, структура расходов, и несколько текстовых выводов
// сравнением последних двух месяцев. "Что если"-калькулятор и сравнение с
// другими студиями — следующие слои, сознательно не в этой итерации.

function pctChange(curr, prev) {
  if (!prev) return null;
  return Math.round(((curr - prev) / Math.abs(prev)) * 1000) / 10;
}

function buildInsights(trends) {
  if (!trends || trends.length < 2) return [];
  const curr = trends[trends.length - 1];
  const prev = trends[trends.length - 2];
  const insights = [];

  const revChange = pctChange(curr.revenue, prev.revenue);
  if (revChange != null && Math.abs(revChange) >= 1) {
    insights.push(`Выручка ${revChange >= 0 ? 'выросла' : 'упала'} на ${Math.abs(revChange)}% к прошлому месяцу (${money(prev.revenue)} → ${money(curr.revenue)}).`);
  }

  if (curr.netProfit != null && prev.netProfit != null && Math.abs(curr.netProfit - prev.netProfit) > 1) {
    const drivers = [
      { label: 'выручка', delta: curr.revenue - prev.revenue, isRevenue: true },
      { label: 'постоянные расходы', delta: curr.fixedExpenses - prev.fixedExpenses },
      { label: 'переменные расходы', delta: curr.variableExpenses - prev.variableExpenses },
      { label: 'зарплаты мастеров', delta: curr.masterSalaries - prev.masterSalaries },
    ];
    const biggest = drivers.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a));
    if (Math.abs(biggest.delta) > 1) {
      const verb = biggest.isRevenue ? (biggest.delta >= 0 ? 'выросла' : 'упала') : biggest.delta >= 0 ? 'выросли' : 'снизились';
      insights.push(
        `Прибыль ${curr.netProfit >= prev.netProfit ? 'выросла' : 'снизилась'} — больше всего повлияли: ${biggest.label} ${verb} на ${money(Math.abs(biggest.delta))}.`
      );
    }
  }

  const ticketChange = pctChange(curr.avgTicket, prev.avgTicket);
  if (ticketChange != null && Math.abs(ticketChange) >= 5 && curr.avgTicket > 0 && prev.avgTicket > 0) {
    insights.push(`Средний чек ${ticketChange >= 0 ? 'вырос' : 'упал'} на ${Math.abs(ticketChange)}% (${money(prev.avgTicket)} → ${money(curr.avgTicket)}).`);
  }

  return insights.slice(0, 3);
}

const MONTH_LABELS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
function monthLabel(ym) {
  const [, m] = ym.split('-');
  return MONTH_LABELS[Number(m) - 1] || ym;
}

const WEEKDAY_LABELS = { 0: 'Вс', 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб' };

function InsightsSection({ insights, error, byMaster }) {
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!insights) return null;

  const hourBars = insights.byHour.map((h) => ({ key: h.hour, label: h.hour % 3 === 0 ? String(h.hour) : '', value: h.visitsCount }));
  const weekdayBars = insights.byWeekday.map((w) => ({ key: w.weekday, label: WEEKDAY_LABELS[w.weekday], value: w.visitsCount }));
  const hasVisits = insights.byWeekday.some((w) => w.visitsCount > 0);
  const topMasters = [...(byMaster || [])].sort((a, b) => b.revenue - a.revenue).filter((m) => m.visitsCount > 0);

  return (
    <>
      {hasVisits && (
        <Card>
          <ST>Загруженность по дням недели</ST>
          <VerticalBarChart bars={weekdayBars} formatValue={(v) => `${v} визитов`} />
        </Card>
      )}
      {hasVisits && (
        <Card>
          <ST>Загруженность по часам</ST>
          <VerticalBarChart bars={hourBars} formatValue={(v) => `${v} визитов`} color={CHART_COLORS.aqua} />
        </Card>
      )}
      {insights.popularServices.length > 0 && (
        <Card>
          <ST>Популярные услуги</ST>
          {insights.popularServices.map((s) => (
            <div key={s.service} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13 }}>
              <span style={{ color: C.secondary }}>{s.service} <span style={{ color: C.subtle }}>· {s.visitsCount}</span></span>
              <span style={{ fontWeight: 700 }}>{money(s.revenue)}</span>
            </div>
          ))}
        </Card>
      )}
      {topMasters.length > 0 && (
        <Card>
          <ST>Рейтинг мастеров по выручке</ST>
          {topMasters.map((m, i) => (
            <div key={m.masterMembershipId} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13 }}>
              <span style={{ color: C.secondary }}>#{i + 1} {m.masterName || '—'} <span style={{ color: C.subtle }}>· {m.visitsCount}</span></span>
              <span style={{ fontWeight: 700 }}>{money(m.revenue)}</span>
            </div>
          ))}
        </Card>
      )}
      {insights.utilization && insights.utilization.byMaster.length > 0 && (
        <Card>
          <ST>Загрузка мастеров</ST>
          <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10, lineHeight: 1.5 }}>
            % занятого времени по дням, когда были визиты — из длительности услуг из каталога.
          </div>
          {insights.utilization.byMaster.map((m) => (
            <div key={m.masterMembershipId} style={{ padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: C.secondary }}>{m.masterName || '—'} <span style={{ color: C.subtle }}>· {m.workingDays} дн. по {m.dailyHours} ч</span></span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{m.utilizationPercent != null ? `${m.utilizationPercent}%` : '—'}</span>
              </div>
              {m.dataCoveragePercent < 100 && (
                <div style={{ fontSize: 11, color: C.orange, marginTop: 2 }}>
                  Только {m.dataCoveragePercent}% визитов связаны с услугой из каталога — реальная загрузка выше
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
      <Card>
        <div style={{ display: 'flex', gap: 16 }}>
          <StatTile label="Визитов со скидкой" value={`${insights.discountUsage.discountRate}%`} />
          <StatTile label="Сумма скидок за период" value={money(insights.discountUsage.totalDiscountAmount)} />
        </div>
      </Card>
      <Card>
        <ST>Повторяемость клиентов (за всё время)</ST>
        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
          <StatTile label="Вернулись хотя бы раз" value={`${insights.repeatClients.repeatRate}%`} />
          <StatTile
            label="Средний интервал"
            value={insights.repeatClients.avgIntervalDays != null ? `${Math.round(insights.repeatClients.avgIntervalDays)} дн.` : '—'}
          />
        </div>
      </Card>
    </>
  );
}

function AnalyticsTab({ trends, error, insights: insightsData, insightsError, byMaster }) {
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!trends) return <div className="page-loading">Загрузка...</div>;
  if (trends.every((t) => t.revenue === 0 && t.visitsCount === 0)) {
    return <div className="empty-hint">Пока нет данных за последние месяцы — тренды появятся по мере ведения визитов и финансов.</div>;
  }

  const isOwner = trends[0]?.netProfit !== undefined;
  const insights = buildInsights(trends);
  const curr = trends[trends.length - 1];
  const prev = trends[trends.length - 2];

  const chartPoints = trends.map((t) => ({
    x: monthLabel(t.month),
    values: isOwner ? { revenue: t.revenue, netProfit: t.netProfit } : { revenue: t.revenue },
  }));
  const series = isOwner
    ? [
        { key: 'revenue', label: 'Выручка', color: CHART_COLORS.blue },
        { key: 'netProfit', label: 'Прибыль', color: CHART_COLORS.orange },
      ]
    : [{ key: 'revenue', label: 'Выручка', color: CHART_COLORS.blue }];

  const latestWithRevenue = [...trends].reverse().find((t) => t.revenue > 0 && t.fixedExpenses !== undefined);

  return (
    <div>
      {insights.length > 0 && (
        <Card>
          <ST>Что заметно за последний месяц</ST>
          {insights.map((text, i) => (
            <div key={i} style={{ fontSize: 13, color: C.secondary, marginBottom: i < insights.length - 1 ? 8 : 0, lineHeight: 1.5 }}>{text}</div>
          ))}
        </Card>
      )}

      <Card>
        <ST>Выручка{isOwner ? ' и прибыль' : ''} по месяцам</ST>
        <TrendLineChart points={chartPoints} series={series} formatY={compactMoney} />
      </Card>

      <Card>
        <div style={{ display: 'flex', gap: 16 }}>
          <StatTile
            label="Средний чек"
            value={money(curr.avgTicket)}
            delta={prev ? (() => { const d = pctChange(curr.avgTicket, prev.avgTicket); return d == null ? null : `${d >= 0 ? '+' : ''}${d}% к прошлому`; })() : null}
            deltaGood={prev && curr.avgTicket !== prev.avgTicket ? curr.avgTicket > prev.avgTicket : null}
            trend={trends.map((t) => t.avgTicket)}
            trendColor={CHART_COLORS.blue}
          />
          {isOwner && (
            <StatTile
              label="Маржа"
              value={`${curr.marginPercent}%`}
              delta={prev ? `${curr.marginPercent >= prev.marginPercent ? '+' : ''}${round1(curr.marginPercent - prev.marginPercent)} п.п.` : null}
              deltaGood={prev ? curr.marginPercent >= prev.marginPercent : null}
              trend={trends.map((t) => t.marginPercent)}
              trendColor={CHART_COLORS.orange}
            />
          )}
        </div>
      </Card>

      {isOwner && latestWithRevenue && (
        <Card>
          <ST>Структура расходов ({monthLabel(latestWithRevenue.month)})</ST>
          <StackedBarBreakdown
            segments={[
              { key: 'salaries', label: 'Зарплаты', value: latestWithRevenue.masterSalaries, color: CHART_COLORS.blue },
              { key: 'fixed', label: 'Пост. расходы', value: latestWithRevenue.fixedExpenses, color: CHART_COLORS.orange },
              { key: 'percent', label: '% расходы', value: latestWithRevenue.percentExpenses, color: CHART_COLORS.aqua },
              { key: 'variable', label: 'Перем. расходы', value: latestWithRevenue.variableExpenses, color: CHART_COLORS.yellow },
            ]}
          />
        </Card>
      )}

      <InsightsSection insights={insightsData} error={insightsError} byMaster={byMaster} />
    </div>
  );
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function MasterDetailView({ master, dateFrom, dateTo, onBack }) {
  const [visits, setVisits] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get('/modules/visits', { params: { masterMembershipId: master.masterMembershipId, dateFrom: `${dateFrom}T00:00:00`, dateTo: `${dateTo}T23:59:59` } })
      .then((res) => setVisits(res.data));
  }, [master.masterMembershipId, dateFrom, dateTo]);

  return (
    <div>
      <BackBtn onClick={onBack} />
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{master.masterName || '—'}</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 20 }}>Визиты за период · комиссия {money(master.earnings)}</div>
      <Card style={{ padding: 0 }}>
        {visits === null ? (
          <div style={{ padding: 20, textAlign: 'center', color: C.subtle }}>Загрузка...</div>
        ) : visits.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: C.subtle, fontSize: 14 }}>Визитов не найдено</div>
        ) : (
          // Раньше строка была просто текстом — не было способа посмотреть
          // материалы/скидку/способ оплаты/фото конкретного визита, только
          // итоговую сумму. Ведёт на тот же экран редактирования визита, что
          // и в "Визитах" — не дублируем разметку, там уже есть все детали.
          visits.map((v, i) => (
            <div
              key={v.id}
              onClick={() => navigate(`/visits?open=${v.id}`)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: i < visits.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{v.client_last_name} {v.client_first_name}</div>
                <div style={{ fontSize: 12, color: C.subtle }}>{v.service} · {new Date(v.visit_at).toLocaleString('ru-RU')}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{money(v.master_earnings)}</div>
                  <div style={{ fontSize: 11, color: C.subtle }}>чек {money(v.final_amount)}</div>
                </div>
                <span style={{ fontSize: 20, color: C.border }}>›</span>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

// ---------- Мастер ----------

function MasterFinance() {
  const period = usePeriodParams();
  const [visits, setVisits] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);

  function load() {
    if (!period.ready) return Promise.resolve();
    const { from, to } = computePeriodRange(period.preset, period.customFrom, period.customTo);
    // 15.08.2026: владелец пересмотрел решение "Задачи 3" — мастер видит
    // только свои данные, не сводку компании целиком. /modules/visits и
    // /modules/finance/adjustments и так уже отдают мастеру только его
    // записи (role === 'master' фильтр внутри каждого роута), поэтому
    // отдельный запрос /modules/finance/summary (компанейские агрегаты)
    // сюда больше не идёт.
    return Promise.all([
      api.get('/modules/visits', { params: { dateFrom: `${from}T00:00:00`, dateTo: `${to}T23:59:59` } }),
      api.get('/modules/finance/adjustments', { params: { dateFrom: from, dateTo: to } }),
    ])
      .then(([v, a]) => {
        setVisits(v.data);
        setAdjustments(a.data);
      })
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [period.preset, period.customFrom, period.customTo]);
  usePullToRefresh(load);

  if (loading) return <div className="page-loading">Загрузка...</div>;

  const revenue = visits.reduce((s, v) => s + Number(v.final_amount), 0);
  const commission = visits.reduce((s, v) => s + Number(v.master_earnings), 0);
  const adjTotal = adjustments.reduce((s, a) => s + Number(a.amount), 0);
  const totalPayout = commission + adjTotal;

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Мои финансы</div>
      <PeriodBar {...period} />

      <div style={{ background: C.primary, borderRadius: 16, padding: 20, marginBottom: 12, color: '#FFF' }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Итого к выплате</div>
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-1.5px' }}>{money(totalPayout)}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>{visits.length} визитов</div>
      </div>

      <Card>
        <ExpRow label="Выручка с клиентов" value={money(revenue)} />
        <ExpRow label="Комиссия с визитов" value={money(commission)} />
        <ExpRow label="Корректировки" value={money(adjTotal)} />
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', marginTop: 4, borderTop: `2px solid ${C.border}` }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.subtle }}>Итого к выплате</span>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{money(totalPayout)}</span>
        </div>
      </Card>

      {adjustments.length > 0 && (
        <Card>
          <ST>Корректировки</ST>
          {adjustments.map((a, i, arr) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div>
                <div style={{ fontSize: 13 }}>{a.comment}</div>
                <div style={{ fontSize: 11, color: C.subtle, marginTop: 2 }}>{new Date(a.occurred_at).toLocaleDateString('ru-RU')}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: Number(a.amount) >= 0 ? C.green : C.red }}>{Number(a.amount) >= 0 ? '+' : ''}{money(a.amount)}</div>
            </div>
          ))}
        </Card>
      )}

      <Card>
        <ST>История визитов</ST>
        {visits.length === 0 ? (
          <div className="empty-hint">Нет визитов за период</div>
        ) : (
          visits.map((v, i) => (
            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < visits.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{v.client_last_name} {v.client_first_name}</div>
                <div style={{ fontSize: 12, color: C.subtle }}>{new Date(v.visit_at).toLocaleString('ru-RU')}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{money(v.master_earnings)}</div>
                <div style={{ fontSize: 11, color: C.subtle }}>{money(v.final_amount)} чек</div>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
