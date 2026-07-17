import { useEffect, useState } from 'react';
import api from '../api/client.js';

const EMPTY_EXPENSE_FORM = { name: '', amount: '', occurredAt: '' };
const EMPTY_RECURRING_FORM = { name: '', kind: 'fixed', amount: '' };

export default function Finance() {
  const [period, setPeriod] = useState('month');
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState(EMPTY_EXPENSE_FORM);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [recurringForm, setRecurringForm] = useState(EMPTY_RECURRING_FORM);

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

  useEffect(load, [period]);
  useEffect(() => {
    api.get('/modules/finance/recurring-expenses').then((res) => setRecurring(res.data));
  }, []);

  async function handleExpenseSubmit(e) {
    e.preventDefault();
    await api.post('/modules/finance/expenses', expenseForm);
    setExpenseForm(EMPTY_EXPENSE_FORM);
    setShowExpenseForm(false);
    load();
  }

  async function handleDeleteExpense(id) {
    if (!confirm('Удалить расход?')) return;
    await api.delete(`/modules/finance/expenses/${id}`);
    load();
  }

  async function handleRecurringSubmit(e) {
    e.preventDefault();
    await api.post('/modules/finance/recurring-expenses', recurringForm);
    setRecurringForm(EMPTY_RECURRING_FORM);
    setShowRecurringForm(false);
    api.get('/modules/finance/recurring-expenses').then((res) => setRecurring(res.data));
  }

  async function toggleRecurring(item) {
    await api.patch(`/modules/finance/recurring-expenses/${item.id}`, { active: !item.active });
    api.get('/modules/finance/recurring-expenses').then((res) => setRecurring(res.data));
  }

  async function handleDeleteRecurring(id) {
    if (!confirm('Удалить статью расходов?')) return;
    await api.delete(`/modules/finance/recurring-expenses/${id}`);
    api.get('/modules/finance/recurring-expenses').then((res) => setRecurring(res.data));
  }

  const totalExpenses = summary
    ? summary.masterSalaries + summary.fixedExpenses + summary.percentExpenses + summary.variableExpenses
    : 0;

  return (
    <div>
      <div className="page-header">
        <h1>Финансы</h1>
        <div className="row-actions">
          <button className="btn btn-danger" onClick={() => setShowExpenseForm(true)}>+ Расход</button>
        </div>
      </div>

      <div className="filters-row">
        {[['today', 'Сегодня'], ['week', 'Неделя'], ['month', 'Месяц']].map(([key, label]) => (
          <button key={key} className={'chip' + (period === key ? ' chip-active' : '')} onClick={() => setPeriod(key)}>
            {label}
          </button>
        ))}
      </div>

      {loading || !summary ? (
        <div className="page-loading">Загрузка...</div>
      ) : (
        <>
          <div className="grid grid-3">
            <div className="stat-card stat-success">
              <div className="stat-value">{summary.revenue.toLocaleString('ru-RU')} ₽</div>
              <div className="stat-label">Выручка</div>
            </div>
            <div className="stat-card stat-danger">
              <div className="stat-value">{totalExpenses.toLocaleString('ru-RU')} ₽</div>
              <div className="stat-label">Расходы</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.netProfit.toLocaleString('ru-RU')} ₽</div>
              <div className="stat-label">Чистая прибыль</div>
            </div>
          </div>

          <div className="grid grid-4" style={{ marginTop: '0.5rem' }}>
            <div className="stat-card">
              <div className="stat-value">{summary.masterSalaries.toLocaleString('ru-RU')} ₽</div>
              <div className="stat-label">Зарплаты мастеров</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.fixedExpenses.toLocaleString('ru-RU')} ₽</div>
              <div className="stat-label">Постоянные расходы</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.percentExpenses.toLocaleString('ru-RU')} ₽</div>
              <div className="stat-label">Процентные расходы</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.variableExpenses.toLocaleString('ru-RU')} ₽</div>
              <div className="stat-label">Переменные расходы</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <div className="card-header"><h3>Заработок по мастерам</h3></div>
            <table className="table">
              <thead>
                <tr><th>Мастер</th><th>Визитов</th><th>Выручка</th><th>Заработок</th></tr>
              </thead>
              <tbody>
                {summary.byMaster.map((m) => (
                  <tr key={m.masterMembershipId}>
                    <td>{m.masterName || '—'}</td>
                    <td>{m.visitsCount}</td>
                    <td>{m.revenue.toLocaleString('ru-RU')} ₽</td>
                    <td>{m.earnings.toLocaleString('ru-RU')} ₽</td>
                  </tr>
                ))}
                {summary.byMaster.length === 0 && <tr><td colSpan={4} className="empty-hint">Нет данных за период</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <div className="card-header"><h3>Переменные расходы за период</h3></div>
            <table className="table">
              <thead>
                <tr><th>Дата</th><th>Название</th><th>Сумма</th><th></th></tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.occurred_at).toLocaleDateString('ru-RU')}</td>
                    <td>{e.name}</td>
                    <td>{Number(e.amount).toLocaleString('ru-RU')} ₽</td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => handleDeleteExpense(e.id)}>✕</button></td>
                  </tr>
                ))}
                {expenses.length === 0 && <tr><td colSpan={4} className="empty-hint">Расходов не найдено</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <h3>Постоянные и процентные расходы</h3>
          <button className="btn btn-sm" onClick={() => setShowRecurringForm(true)}>+ Статья расходов</button>
        </div>
        <p className="page-subtitle">Аренда, сервисы, налог УСН, эквайринг — списываются автоматически при расчёте прибыли</p>
        <table className="table">
          <thead>
            <tr><th>Название</th><th>Тип</th><th>Сумма</th><th>Активна</th><th></th></tr>
          </thead>
          <tbody>
            {recurring.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.kind === 'fixed' ? 'Фикс. ₽/мес' : '% от выручки'}</td>
                <td>{Number(r.amount).toLocaleString('ru-RU')}{r.kind === 'percent' ? '%' : ' ₽'}</td>
                <td>
                  <button className={`btn btn-sm ${r.active ? 'btn-success' : ''}`} onClick={() => toggleRecurring(r)}>
                    {r.active ? 'Активна' : 'Отключена'}
                  </button>
                </td>
                <td><button className="btn btn-sm btn-danger" onClick={() => handleDeleteRecurring(r.id)}>✕</button></td>
              </tr>
            ))}
            {recurring.length === 0 && <tr><td colSpan={5} className="empty-hint">Статей расходов пока нет</td></tr>}
          </tbody>
        </table>
      </div>

      {showExpenseForm && (
        <div className="modal-backdrop" onClick={() => setShowExpenseForm(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleExpenseSubmit}>
            <h3>Новый переменный расход</h3>
            <label className="field">
              <span>Название</span>
              <input required value={expenseForm.name} onChange={(e) => setExpenseForm({ ...expenseForm, name: e.target.value })} />
            </label>
            <label className="field">
              <span>Сумма (₽)</span>
              <input required type="number" min="0" step="1" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
            </label>
            <label className="field">
              <span>Дата</span>
              <input type="date" value={expenseForm.occurredAt} onChange={(e) => setExpenseForm({ ...expenseForm, occurredAt: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowExpenseForm(false)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </div>
      )}

      {showRecurringForm && (
        <div className="modal-backdrop" onClick={() => setShowRecurringForm(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleRecurringSubmit}>
            <h3>Новая статья расходов</h3>
            <label className="field">
              <span>Название</span>
              <input required value={recurringForm.name} onChange={(e) => setRecurringForm({ ...recurringForm, name: e.target.value })} />
            </label>
            <label className="field">
              <span>Тип</span>
              <select value={recurringForm.kind} onChange={(e) => setRecurringForm({ ...recurringForm, kind: e.target.value })}>
                <option value="fixed">Фиксированная сумма в месяц (₽)</option>
                <option value="percent">Процент от выручки (%)</option>
              </select>
            </label>
            <label className="field">
              <span>{recurringForm.kind === 'fixed' ? 'Сумма в месяц (₽)' : 'Процент от выручки (%)'}</span>
              <input required type="number" min="0" step="0.01" value={recurringForm.amount} onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowRecurringForm(false)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
