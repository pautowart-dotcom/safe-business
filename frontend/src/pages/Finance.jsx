import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, ST, BackBtn, Field, TextInput, Select, Btn, Badge, Icon, C, F } from '../ui/components.jsx';
import { TrendLineChart, StatTile, StackedBarBreakdown, CHART_COLORS, compactMoney } from '../ui/charts.jsx';
import { localDateStr } from '../utils/localDate.js';
import { nicheLabel } from '../utils/niches.js';

const PERIOD_PRESETS = [['today', 'Сегодня'], ['week', 'Неделя'], ['month', 'Месяц'], ['lastMonth', 'Прошлый месяц']];
const EMPTY_EXPENSE_FORM = { name: '', amount: '', occurredAt: '' };
const EMPTY_RECURRING_FORM = { name: '', kind: 'fixed', amount: '' };
const EMPTY_ADJUSTMENT_FORM = { masterMembershipId: '', amount: '', comment: '', occurredAt: '' };
const EMPTY_REVENUE_FORM = { amount: '', membershipId: '', comment: '', occurredAt: '' };

const PAYMENT_METHOD_LABELS = { cash: 'Наличные', card: 'Карта', transfer: 'Перевод', package: 'Абонемент', other: 'Другое', unspecified: 'Не указан' };

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
      {/* "Даты" раньше была пятой кнопкой в этом же ряду — при переносе на
          вторую строку (flexWrap) оставалась там одна, с пустым местом
          рядом (не нравилось владельцу). Вынесена отдельной строкой-ссылкой
          под сегментами — так у 4 пресетов ровный ряд, а свой период не
          ломает раскладку, даже если сам заголовок "Даты" короче остальных. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4, background: C.surface, borderRadius: 12, padding: 3 }}>
        {PERIOD_PRESETS.map(([k, l]) => (
          <button key={k} onClick={() => setPreset(k)} style={tabStyle(preset === k)}>{l}</button>
        ))}
      </div>
      <button
        onClick={() => setPreset('custom')}
        style={{ display: 'block', marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, padding: '10px 2px 0', fontSize: 12, fontWeight: isCustom ? 700 : 500, color: isCustom ? C.primary : C.subtle }}
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
  const period = usePeriodParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'overview');
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
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
        ]);
      })
      .then(([exp, adj, rev]) => {
        setExpenses(exp.data);
        setAdjustments(adj.data);
        setRevenue(rev.data);
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [period.preset, period.customFrom, period.customTo]);
  useEffect(() => {
    loadRecurring();
  }, []);
  useEffect(() => {
    loadTrends();
  }, []);
  usePullToRefresh(() => Promise.all([load(), loadRecurring(), loadTrends()]));
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
    setRecurringForm({ name: r.name, kind: r.kind, amount: String(r.amount) });
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
    setExpenseForm({ name: e.name, amount: String(e.amount), occurredAt: (e.occurred_at || '').slice(0, 10) });
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

  if (loading || !summary) return <div className="page-loading">Загрузка...</div>;

  if (selectedMaster) {
    return <MasterDetailView master={selectedMaster} dateFrom={summary.period.from} dateTo={summary.period.to} onBack={backFromMaster} />;
  }

  const adjustmentsByMaster = {};
  for (const a of adjustments) (adjustmentsByMaster[a.master_membership_id] ||= []).push(a);

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Финансы</div>
      <PeriodBar {...period} />

      <div style={{ display: 'flex', background: C.surface, borderRadius: 12, padding: 3, marginBottom: 16 }}>
        {[['overview', 'Обзор'], ['masters', 'По мастерам'], ['analytics', 'Аналитика']].map(([k, l]) => (
          <button
            key={k}
            onClick={() => changeTab(k)}
            style={{ flex: 1, padding: '9px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: F, background: tab === k ? C.bg : 'transparent', color: tab === k ? C.primary : C.subtle, fontSize: 13, fontWeight: tab === k ? 700 : 400, boxShadow: tab === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
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
        />
      )}
      {tab === 'masters' && (
        <MastersTab
          byMaster={summary.byMaster}
          adjustmentsByMaster={adjustmentsByMaster}
          onSelectMaster={selectMaster}
          onAddAdjustment={(m) => setAdjustmentForm({ ...EMPTY_ADJUSTMENT_FORM, masterMembershipId: m.masterMembershipId })}
          onDeleteAdjustment={deleteAdjustment}
        />
      )}
      {tab === 'analytics' && <AnalyticsTab trends={trends} error={trendsError} />}

      {adjustmentForm && (
        <AdjustmentModal form={adjustmentForm} setForm={setAdjustmentForm} masters={masters} onSubmit={submitAdjustment} onClose={() => setAdjustmentForm(null)} />
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
}) {
  return (
    <div>
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
        {revenue.map((r) => (
          <RevenueRow key={r.id} entry={r} onDelete={deleteRevenue} />
        ))}
        {revenue.length === 0 && <div style={{ padding: '10px 0', textAlign: 'center', color: C.subtle, fontSize: 13 }}>Записей о выручке за период нет</div>}
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
          <ExpRow key={r.id} label={r.name} value={money(r.amount)} onEdit={() => openEditRecurring(r)} onDel={() => deleteRecurring(r.id)} />
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
            <div style={{ display: 'flex', gap: 8 }}>
              <TextInput type="number" placeholder="Сумма ₽" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} style={{ background: C.bg }} />
              <Btn small type="submit">{editingExpenseId ? 'Сохранить' : 'Добавить'}</Btn>
              <Btn small type="button" variant="secondary" onClick={closeExpenseForm}>Отмена</Btn>
            </div>
          </form>
        )}
        {expenses.map((e) => (
          <ExpRow key={e.id} label={`${e.name} · ${new Date(e.occurred_at).toLocaleDateString('ru-RU')}`} value={money(e.amount)} onEdit={() => openEditExpense(e)} onDel={() => deleteExpense(e.id)} />
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', marginTop: 4, borderTop: `2px solid ${C.border}` }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.subtle }}>Итого</span>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{money(summary.variableExpenses)}</span>
        </div>
      </Card>
    </div>
  );
}

function RecurringForm({ form, setForm, onSubmit, onCancel, unitLabel, editing }) {
  return (
    <form onSubmit={onSubmit} style={{ background: C.surface, borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <TextInput placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ marginBottom: 8, background: C.bg }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <TextInput type="number" placeholder={unitLabel} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ background: C.bg }} />
        <Btn small type="submit">{editing ? 'Сохранить' : 'Добавить'}</Btn>
        <Btn small type="button" variant="secondary" onClick={onCancel}>Отмена</Btn>
      </div>
    </form>
  );
}

function MastersTab({ byMaster, adjustmentsByMaster, onSelectMaster, onAddAdjustment, onDeleteAdjustment }) {
  return (
    <Card style={{ padding: 0 }}>
      {byMaster.map((m, i) => {
        const adj = adjustmentsByMaster[m.masterMembershipId] || [];
        const adjTotal = adj.reduce((s, a) => s + Number(a.amount), 0);
        const totalPayout = Number(m.earnings) + adjTotal;
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => onAddAdjustment(m)} style={{ background: 'none', border: 'none', color: C.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>+ Добавить корректировку</button>
              <div style={{ fontSize: 15, fontWeight: 800 }}>Итого: {money(totalPayout)}</div>
            </div>
          </div>
        );
      })}
      {byMaster.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: C.subtle, fontSize: 14 }}>Мастеров пока нет</div>}
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

function AnalyticsTab({ trends, error }) {
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
  const [companySummary, setCompanySummary] = useState(null);
  const [loading, setLoading] = useState(true);

  function load() {
    if (!period.ready) return Promise.resolve();
    const { from, to } = computePeriodRange(period.preset, period.customFrom, period.customTo);
    return Promise.all([
      api.get('/modules/visits', { params: { dateFrom: `${from}T00:00:00`, dateTo: `${to}T23:59:59` } }),
      api.get('/modules/finance/adjustments', { params: { dateFrom: from, dateTo: to } }),
      // Задача 3 (сверка ролей): раньше у мастера была только "своя" вкладка
      // (комиссия с визитов) — по решению владельца добавлен просмотр общей
      // сводки компании (без чистой прибыли — та скрыта и от администратора).
      api.get('/modules/finance/summary', { params: period.params }),
    ])
      .then(([v, a, s]) => {
        setVisits(v.data);
        setAdjustments(a.data);
        setCompanySummary(s.data);
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

      {companySummary && (
        <Card>
          <ST>Финансы компании · {companySummary.period.from === companySummary.period.to ? 'за день' : 'за период'} (только просмотр)</ST>
          <ExpRow label="Выручка" value={money(companySummary.revenue)} />
          <ExpRow label="Зарплаты мастеров" value={money(companySummary.masterSalaries)} />
          <ExpRow label="Пост. расходы" value={money(companySummary.fixedExpenses)} />
          <ExpRow label="% расходы" value={money(companySummary.percentExpenses)} />
          <ExpRow label="Перем. расходы" value={money(companySummary.variableExpenses)} />
        </Card>
      )}

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
