import { useEffect, useState } from 'react';
import api from '../api/client.js';

const EMPTY_FORM = { name: '', phone: '', email: '', birthday: '', notes: '' };

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);

  function load(searchTerm) {
    setLoading(true);
    api
      .get('/clients', { params: searchTerm ? { search: searchTerm } : {} })
      .then((res) => setClients(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timer = setTimeout(() => load(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(client) {
    setForm({
      name: client.name || '',
      phone: client.phone || '',
      email: client.email || '',
      birthday: client.birthday ? client.birthday.slice(0, 10) : '',
      notes: client.notes || '',
    });
    setEditingId(client.id);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (editingId) {
      await api.put(`/clients/${editingId}`, form);
    } else {
      await api.post('/clients', form);
    }
    setShowForm(false);
    load(search);
  }

  async function handleDelete(id) {
    if (!confirm('Удалить клиента? Это действие необратимо.')) return;
    await api.delete(`/clients/${id}`);
    setSelected(null);
    load(search);
  }

  async function openDetails(client) {
    const res = await api.get(`/clients/${client.id}`);
    setSelected(res.data);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Клиенты</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Новый клиент</button>
      </div>

      <input
        className="search-input"
        placeholder="Поиск по имени, телефону или email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Имя</th>
              <th>Телефон</th>
              <th>Email</th>
              <th>Добавлен</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td><a onClick={() => openDetails(c)} className="link">{c.name}</a></td>
                <td>{c.phone || '—'}</td>
                <td>{c.email || '—'}</td>
                <td>{new Date(c.created_at).toLocaleDateString('ru-RU')}</td>
                <td className="row-actions">
                  <button className="btn btn-sm" onClick={() => openEdit(c)}>Изменить</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(c.id)}>Удалить</button>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr><td colSpan={5} className="empty-hint">Клиенты не найдены</td></tr>
            )}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <h3>{editingId ? 'Изменить клиента' : 'Новый клиент'}</h3>
            <label className="field">
              <span>Имя</span>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              <span>Телефон</span>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="field">
              <span>Дата рождения</span>
              <input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} />
            </label>
            <label className="field">
              <span>Заметки</span>
              <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </div>
      )}

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{selected.name}</h3>
            <p>{selected.phone} {selected.email && `· ${selected.email}`}</p>
            {selected.notes && <p className="notes-block">{selected.notes}</p>}
            <h4>История визитов</h4>
            {selected.visits?.length ? (
              <ul className="list">
                {selected.visits.map((v) => (
                  <li key={v.id}>
                    {new Date(v.scheduled_at).toLocaleDateString('ru-RU')} — {v.service}
                    {v.master_name && ` · ${v.master_name}`} · {v.price} ₽
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-hint">Визитов ещё не было</p>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setSelected(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
