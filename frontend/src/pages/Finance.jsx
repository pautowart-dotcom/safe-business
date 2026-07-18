import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, ST, PeriodFilter, Field, TextInput, Select, Btn, Icon, C } from '../ui/components.jsx';

const EMPTY_EXPENSE_FORM = { name: '', amount: '', occurredAt: '' };
const EMPTY_RECURRING_FORM = { name: '', kind: 'fixed', amount: '' };

function money(v) {
  return `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
}

function ExpRow({ label, value, onDel }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 14 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{value}</span>
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
  const { isOwner } = useAuth();
  return isOwner ? <OwnerFinance /> : <MasterFinance />;
}

function OwnerFinance() {
  const [period, setPeriod] = useState('month');
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expenseForm, setExpenseForm] = useState(null);
  const [recurringForm, setRecurringForm] = useState(null);

  function load() {
    setLoading(true);
    api
      .get('/modules/finance/summary', { params: { period } })
      .then((res) => {
        setSummary(res.data);
        return api.get('/modules/finance/expenses', { params: { dateFrom: res.data.period.from, dateTo: res.data.period.to } });
      })
      .then((res) => setExpenses(res.data))
      .finally(() => setLoading(false));
  }
  function loadRecurring() {
    api.get('/modules/finance/recurring-expenses').then((res) => setRecurring(res.data));
  }

  useEffect(load, [period]);
  useEffect(loadRecurring, []);

  async function submitExpense(e) {
    e.preventDefault();
    if (!expenseForm.name) return;
    await api.post('/modules/finance/expenses', expenseForm);
    setExpenseForm(null);
    load();
  }

  async function submitRecurring(e) {
    e.preventDefault();
    if (!recurringForm.name) return;
    await api.post('/modules/finance/recurring-expenses', recurringForm);
    setRecurringForm(null);
    loadRecurring();
  }

  async function deleteExpense(id) {
    await api.delete(`/modules/finance/expenses/${id}`);
    load();
  }
  async function deleteRecurring(id) {
    await api.delete(`/modules/finance/recurring-expenses/${id}`);
    loadRecurring();
  }

  if (loading || !summary) return <div className="page-loading">Загрузка...</div>;

  const totalExpenses = summary.masterSalaries + summary.fixedExpenses + summary.percentExpenses + summary.variableExpenses;

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Финансы</div>
      <PeriodFilter value={period} onChange={setPeriod} />

      <div style={{ background: C.primary, borderRadius: 16, padding: 20, marginBottom: 12, color: '#FFF' }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Чистая прибыль</div>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-1.5px', color: summary.netProfit >= 0 ? '#FFF' : '#FCA5A5' }}>{money(summary.netProfit)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
          {[['Выручка', summary.revenue], ['Зарплаты', summary.masterSalaries], ['Пост. расходы', summary.fixedExpenses], ['% расходы', summary.percentExpenses], ['Перем. расходы', summary.variableExpenses], ['Всего расходов', totalExpenses]].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{money(v)}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <Card>
        <ST>Зарплаты мастеров</ST>
        {summary.byMaster.map((m, i) => (
          <div key={m.masterMembershipId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: i < summary.byMaster.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{m.masterName || '—'}</div>
              <div style={{ fontSize: 12, color: C.subtle }}>{m.visitsCount} виз. · выручка {money(m.revenue)}</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{money(m.earnings)}</div>
          </div>
        ))}
        {summary.byMaster.length === 0 && <div className="empty-hint">Нет данных за период</div>}
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <ST>Постоянные расходы</ST>
          <button onClick={() => setRecurringForm(recurringForm ? null : { ...EMPTY_RECURRING_FORM, kind: 'fixed' })} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <Icon name="plus" size={18} color={C.primary} />
          </button>
        </div>
        {recurringForm && recurringForm.kind === 'fixed' && (
          <RecurringForm form={recurringForm} setForm={setRecurringForm} onSubmit={submitRecurring} unitLabel="Сумма ₽/мес" />
        )}
        {recurring.filter((r) => r.kind === 'fixed').map((r) => (
          <ExpRow key={r.id} label={r.name} value={money(r.amount)} onDel={() => deleteRecurring(r.id)} />
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', marginTop: 4, borderTop: `2px solid ${C.border}` }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.subtle }}>Итого</span>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{money(summary.fixedExpenses)}</span>
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <ST>Расходы в % от выручки</ST>
          <button onClick={() => setRecurringForm(recurringForm && recurringForm.kind === 'percent' ? null : { ...EMPTY_RECURRING_FORM, kind: 'percent' })} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <Icon name="plus" size={18} color={C.primary} />
          </button>
        </div>
        {recurringForm && recurringForm.kind === 'percent' && (
          <RecurringForm form={recurringForm} setForm={setRecurringForm} onSubmit={submitRecurring} unitLabel="% от выручки" />
        )}
        {recurring.filter((r) => r.kind === 'percent').map((r) => (
          <ExpRow key={r.id} label={`${r.name} (${r.amount}%)`} value={money(Math.round((summary.revenue * r.amount) / 100))} onDel={() => deleteRecurring(r.id)} />
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', marginTop: 4, borderTop: `2px solid ${C.border}` }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.subtle }}>Итого</span>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{money(summary.percentExpenses)}</span>
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <ST>Переменные расходы</ST>
          <button onClick={() => setExpenseForm(expenseForm ? null : EMPTY_EXPENSE_FORM)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <Icon name="plus" size={18} color={C.primary} />
          </button>
        </div>
        {expenseForm && (
          <form onSubmit={submitExpense} style={{ background: C.surface, borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <TextInput placeholder="Название" value={expenseForm.name} onChange={(e) => setExpenseForm({ ...expenseForm, name: e.target.value })} style={{ marginBottom: 8, background: C.bg }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <TextInput type="number" placeholder="Сумма ₽" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} style={{ background: C.bg }} />
              <Btn small type="submit">Добавить</Btn>
            </div>
          </form>
        )}
        {expenses.map((e) => (
          <ExpRow key={e.id} label={`${e.name} · ${new Date(e.occurred_at).toLocaleDateString('ru-RU')}`} value={money(e.amount)} onDel={() => deleteExpense(e.id)} />
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', marginTop: 4, borderTop: `2px solid ${C.border}` }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.subtle }}>Итого</span>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{money(summary.variableExpenses)}</span>
        </div>
      </Card>
    </div>
  );
}

function RecurringForm({ form, setForm, onSubmit, unitLabel }) {
  return (
    <form onSubmit={onSubmit} style={{ background: C.surface, borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <TextInput placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ marginBottom: 8, background: C.bg }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <TextInput type="number" placeholder={unitLabel} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ background: C.bg }} />
        <Btn small type="submit">Добавить</Btn>
      </div>
    </form>
  );
}

function MasterFinance() {
  const [period, setPeriod] = useState('today');
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = {};
    const now = new Date();
    if (period === 'today') {
      const d = now.toISOString().slice(0, 10);
      params.dateFrom = `${d}T00:00:00`;
      params.dateTo = `${d}T23:59:59`;
    } else {
      const from = new Date(now);
      from.setDate(from.getDate() - (period === 'week' ? 6 : 29));
      params.dateFrom = from.toISOString();
    }
    api.get('/modules/visits', { params }).then((res) => setVisits(res.data)).finally(() => setLoading(false));
  }, [period]);

  if (loading) return <div className="page-loading">Загрузка...</div>;

  const revenue = visits.reduce((s, v) => s + Number(v.final_amount), 0);
  const earned = visits.reduce((s, v) => s + Number(v.master_earnings), 0);

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Мои финансы</div>
      <PeriodFilter value={period} onChange={setPeriod} />
      <div style={{ background: C.primary, borderRadius: 16, padding: 20, marginBottom: 12, color: '#FFF' }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Мой заработок</div>
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-1.5px' }}>{money(earned)}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>{visits.length} визитов</div>
      </div>
      <Card>
        <ExpRow label="Выручка с клиентов" value={money(revenue)} />
        <ExpRow label="Мой заработок" value={money(earned)} />
      </Card>
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
