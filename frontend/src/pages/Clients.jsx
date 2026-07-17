import { useEffect, useState } from 'react';
import api from '../api/client.js';

const EMPTY_FORM = { firstName: '', lastName: '', phone: '' };

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  function load(searchTerm) {
    setLoading(true);
    api
      .get('/modules/clients', { params: searchTerm ? { search: searchTerm } : {} })
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
      firstName: client.first_name || '',
      lastName: client.last_name || '',
      phone: client.phone || '',
    });
    setEditingId(client.id);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (editingId) {
      await api.patch(`/modules/clients/${editingId}`, form);
    } else {
      await api.post('/modules/clients', form);
    }
    setShowForm(false);
    load(search);
  }

  async function handleDelete(id) {
    if (!confirm('Удалить клиента? Это действие необратимо.')) return;
    await api.delete(`/modules/clients/${id}`);
    load(search);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Клиенты</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Новый клиент</button>
      </div>

      <input
        className="search-input"
        placeholder="Поиск по фамилии или имени"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Фамилия</th>
              <th>Имя</th>
              <th>Телефон</th>
              <th>Добавлен</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td>{c.last_name}</td>
                <td>{c.first_name}</td>
                <td>{c.phone || '—'}</td>
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
              <span>Фамилия</span>
              <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </label>
            <label className="field">
              <span>Имя</span>
              <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </label>
            <label className="field">
              <span>Телефон</span>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
