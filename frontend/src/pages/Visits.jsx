import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const EMPTY_FORM = {
  client_id: '', master_id: '', service: '', scheduled_at: '', duration_minutes: 60, price: '', notes: '',
};

export default function Visits() {
  const { isOwner } = useAuth();
  const [visits, setVisits] = useState([]);
  const [clients, setClients] = useState([]);
  const [masters, setMasters] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  function load() {
    setLoading(true);
    api
      .get('/visits', { params: statusFilter ? { status: statusFilter } : {} })
      .then((res) => setVisits(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    api.get('/clients').then((res) => setClients(res.data));
    api.get('/users/masters/list').then((res) => setMasters(res.data));
  }, []);

  useEffect(load, [statusFilter]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await api.post('/visits', form);
    setShowForm(false);
    load();
  }

  async function updateStatus(visit, status) {
    await api.put(`/visits/${visit.id}`, { status });
    load();
  }

  async function handleDelete(id) {
    if (!confirm('Удалить визит?')) return;
    await api.delete(`/visits/${id}`);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Визиты</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Новый визит</button>
      </div>

      <div className="filters-row">
        {['', 'planned', 'completed', 'cancelled', 'no_show'].map((s) => (
          <button
            key={s}
            className={'chip' + (statusFilter === s ? ' chip-active' : '')}
            onClick={() => setStatusFilter(s)}
          >
            {s ? statusLabel(s) : 'Все'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Дата и время</th>
              <th>Клиент</th>
              <th>Услуга</th>
              {isOwner && <th>Мастер</th>}
              <th>Цена</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.id}>
                <td>{new Date(v.scheduled_at).toLocaleString('ru-RU')}</td>
                <td>{v.client_name}</td>
                <td>{v.service}</td>
                {isOwner && <td>{v.master_name || '—'}</td>}
                <td>{Number(v.price).toLocaleString('ru-RU')} ₽</td>
                <td><span className={`badge badge-${v.status}`}>{statusLabel(v.status)}</span></td>
                <td className="row-actions">
                  {v.status === 'planned' && (
                    <>
                      <button className="btn btn-sm btn-success" onClick={() => updateStatus(v, 'completed')}>Завершить</button>
                      <button className="btn btn-sm" onClick={() => updateStatus(v, 'no_show')}>Не пришёл</button>
                      <button className="btn btn-sm btn-danger" onClick={() => updateStatus(v, 'cancelled')}>Отменить</button>
                    </>
                  )}
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(v.id)}>✕</button>
                </td>
              </tr>
            ))}
            {visits.length === 0 && (
              <tr><td colSpan={isOwner ? 7 : 6} className="empty-hint">Визитов не найдено</td></tr>
            )}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <h3>Новый визит</h3>
            <label className="field">
              <span>Клиент</span>
              <select required value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                <option value="">Выберите клиента</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            {isOwner && (
              <label className="field">
                <span>Мастер</span>
                <select value={form.master_id} onChange={(e) => setForm({ ...form, master_id: e.target.value })}>
                  <option value="">Не назначен</option>
                  {masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
            )}
            <label className="field">
              <span>Услуга</span>
              <input required value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} />
            </label>
            <label className="field">
              <span>Дата и время</span>
              <input required type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
            </label>
            <label className="field">
              <span>Длительность (мин)</span>
              <input type="number" min="15" step="15" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} />
            </label>
            <label className="field">
              <span>Цена (₽)</span>
              <input type="number" min="0" step="50" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </label>
            <label className="field">
              <span>Заметки</span>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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

function statusLabel(status) {
  return { planned: 'Запланирован', completed: 'Завершён', cancelled: 'Отменён', no_show: 'Не пришёл' }[status] || status;
}
