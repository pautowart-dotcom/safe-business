import { useEffect, useState } from 'react';
import api from '../api/client.js';

const EMPTY_FORM = { name: '', email: '', phone: '', password: '', role: 'master' };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  function load() {
    setLoading(true);
    api.get('/users').then((res) => setUsers(res.data)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    await api.post('/users', form);
    setForm(EMPTY_FORM);
    setShowForm(false);
    load();
  }

  async function toggleActive(user) {
    await api.put(`/users/${user.id}`, { active: !user.active });
    load();
  }

  if (loading) return <div className="page-loading">Загрузка...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Сотрудники</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Добавить сотрудника</button>
      </div>

      <table className="table">
        <thead>
          <tr><th>Имя</th><th>Email</th><th>Телефон</th><th>Роль</th><th>Статус</th><th></th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>{u.phone || '—'}</td>
              <td>{u.role === 'owner' ? 'Владелец' : 'Мастер'}</td>
              <td><span className={`badge badge-${u.active ? 'completed' : 'cancelled'}`}>{u.active ? 'Активен' : 'Заблокирован'}</span></td>
              <td>
                <button className="btn btn-sm" onClick={() => toggleActive(u)}>
                  {u.active ? 'Заблокировать' : 'Разблокировать'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <h3>Новый сотрудник</h3>
            <label className="field">
              <span>Имя</span>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              <span>Email</span>
              <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="field">
              <span>Телефон</span>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="field">
              <span>Пароль</span>
              <input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </label>
            <label className="field">
              <span>Роль</span>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="master">Мастер</option>
                <option value="owner">Владелец</option>
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Создать</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
