import { useEffect, useState } from 'react';
import api from '../api/client.js';

const EMPTY_FORM = { type: 'income', amount: '', category: '', description: '', occurred_at: '' };
const CATEGORY_PRESETS = {
  income: ['Услуги', 'Продажа товаров', 'Прочее'],
  expense: ['Расходники', 'Аренда', 'Зарплата', 'Реклама', 'Коммунальные услуги', 'Прочее'],
};

export default function Finance() {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [range, setRange] = useState(defaultRange());

  function load() {
    setLoading(true);
    Promise.all([
      api.get('/finance', { params: range }),
      api.get('/finance/summary', { params: range }),
    ])
      .then(([tx, sum]) => {
        setTransactions(tx.data);
        setSummary(sum.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [range]);

  function openCreate(type) {
    setForm({ ...EMPTY_FORM, type });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await api.post('/finance', form);
    setShowForm(false);
    load();
  }

  async function handleDelete(id) {
    if (!confirm('Удалить операцию?')) return;
    await api.delete(`/finance/${id}`);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Финансы</h1>
        <div className="row-actions">
          <button className="btn btn-success" onClick={() => openCreate('income')}>+ Доход</button>
          <button className="btn btn-danger" onClick={() => openCreate('expense')}>+ Расход</button>
        </div>
      </div>

      <div className="filters-row">
        <label className="field-inline">
          <span>С</span>
          <input type="date" value={range.from?.slice(0, 10) || ''} onChange={(e) => setRange({ ...range, from: e.target.value ? `${e.target.value}T00:00:00` : undefined })} />
        </label>
        <label className="field-inline">
          <span>По</span>
          <input type="date" value={range.to?.slice(0, 10) || ''} onChange={(e) => setRange({ ...range, to: e.target.value ? `${e.target.value}T23:59:59` : undefined })} />
        </label>
      </div>

      {summary && (
        <div className="grid grid-3">
          <div className="stat-card stat-success">
            <div className="stat-value">{Number(summary.income).toLocaleString('ru-RU')} ₽</div>
            <div className="stat-label">Доход</div>
          </div>
          <div className="stat-card stat-danger">
            <div className="stat-value">{Number(summary.expense).toLocaleString('ru-RU')} ₽</div>
            <div className="stat-label">Расход</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{Number(summary.profit).toLocaleString('ru-RU')} ₽</div>
            <div className="stat-label">Прибыль</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Тип</th>
              <th>Категория</th>
              <th>Сумма</th>
              <th>Описание</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.occurred_at).toLocaleDateString('ru-RU')}</td>
                <td><span className={`badge badge-${t.type === 'income' ? 'completed' : 'cancelled'}`}>{t.type === 'income' ? 'Доход' : 'Расход'}</span></td>
                <td>{t.category}</td>
                <td>{Number(t.amount).toLocaleString('ru-RU')} ₽</td>
                <td>{t.description || '—'}</td>
                <td><button className="btn btn-sm btn-danger" onClick={() => handleDelete(t.id)}>✕</button></td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr><td colSpan={6} className="empty-hint">Операций не найдено</td></tr>
            )}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <h3>{form.type === 'income' ? 'Новый доход' : 'Новый расход'}</h3>
            <label className="field">
              <span>Сумма (₽)</span>
              <input required type="number" min="0" step="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            <label className="field">
              <span>Категория</span>
              <input required list="category-options" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <datalist id="category-options">
                {CATEGORY_PRESETS[form.type].map((c) => <option key={c} value={c} />)}
              </datalist>
            </label>
            <label className="field">
              <span>Дата</span>
              <input type="date" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} />
            </label>
            <label className="field">
              <span>Описание</span>
              <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString().slice(0, 19), to: undefined };
}
