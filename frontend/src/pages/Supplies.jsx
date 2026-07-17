import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const EMPTY_FORM = { name: '', category: '', unit: 'шт', quantity: 0, min_threshold: 0, price_per_unit: 0 };

export default function Supplies() {
  const { isOwner } = useAuth();
  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [moveTarget, setMoveTarget] = useState(null);
  const [moveForm, setMoveForm] = useState({ type: 'out', quantity: '', note: '' });

  function load() {
    setLoading(true);
    api.get('/supplies').then((res) => setSupplies(res.data)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    await api.post('/supplies', form);
    setForm(EMPTY_FORM);
    setShowForm(false);
    load();
  }

  async function handleDelete(id) {
    if (!confirm('Удалить позицию склада?')) return;
    await api.delete(`/supplies/${id}`);
    load();
  }

  function openMove(supply, type) {
    setMoveTarget(supply);
    setMoveForm({ type, quantity: '', note: '' });
  }

  async function handleMove(e) {
    e.preventDefault();
    await api.post(`/supplies/${moveTarget.id}/transactions`, moveForm);
    setMoveTarget(null);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Расходники</h1>
        {isOwner && <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Новая позиция</button>}
      </div>

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Категория</th>
              <th>Остаток</th>
              <th>Минимум</th>
              <th>Цена/ед.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {supplies.map((s) => {
              const low = Number(s.quantity) <= Number(s.min_threshold);
              return (
                <tr key={s.id} className={low ? 'row-warn' : ''}>
                  <td>{s.name} {low && <span className="badge badge-cancelled">мало</span>}</td>
                  <td>{s.category || '—'}</td>
                  <td>{Number(s.quantity)} {s.unit}</td>
                  <td>{Number(s.min_threshold)} {s.unit}</td>
                  <td>{Number(s.price_per_unit).toLocaleString('ru-RU')} ₽</td>
                  <td className="row-actions">
                    <button className="btn btn-sm" onClick={() => openMove(s, 'out')}>Списать</button>
                    {isOwner && <button className="btn btn-sm btn-success" onClick={() => openMove(s, 'in')}>Приход</button>}
                    {isOwner && <button className="btn btn-sm btn-danger" onClick={() => handleDelete(s.id)}>✕</button>}
                  </td>
                </tr>
              );
            })}
            {supplies.length === 0 && (
              <tr><td colSpan={6} className="empty-hint">Склад пуст</td></tr>
            )}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <h3>Новая позиция склада</h3>
            <label className="field">
              <span>Название</span>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              <span>Категория</span>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </label>
            <label className="field">
              <span>Единица измерения</span>
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </label>
            <label className="field">
              <span>Начальный остаток</span>
              <input type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </label>
            <label className="field">
              <span>Минимальный остаток</span>
              <input type="number" min="0" value={form.min_threshold} onChange={(e) => setForm({ ...form, min_threshold: e.target.value })} />
            </label>
            <label className="field">
              <span>Цена за единицу (₽)</span>
              <input type="number" min="0" value={form.price_per_unit} onChange={(e) => setForm({ ...form, price_per_unit: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </div>
      )}

      {moveTarget && (
        <div className="modal-backdrop" onClick={() => setMoveTarget(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleMove}>
            <h3>{moveForm.type === 'in' ? 'Приход' : 'Списание'}: {moveTarget.name}</h3>
            <label className="field">
              <span>Количество ({moveTarget.unit})</span>
              <input required type="number" min="0.01" step="0.01" value={moveForm.quantity} onChange={(e) => setMoveForm({ ...moveForm, quantity: e.target.value })} />
            </label>
            <label className="field">
              <span>Примечание</span>
              <input value={moveForm.note} onChange={(e) => setMoveForm({ ...moveForm, note: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setMoveTarget(null)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Подтвердить</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
