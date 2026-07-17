import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const EMPTY_FORM = { title: '', description: '', role_target: 'master', items: [''] };

export default function Checklists() {
  const { isOwner } = useAuth();
  const [checklists, setChecklists] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const today = new Date().toISOString().slice(0, 10);

  function load() {
    setLoading(true);
    Promise.all([
      api.get('/checklists'),
      api.get('/checklists/completions', { params: { date: today } }),
    ])
      .then(([cl, comp]) => {
        setChecklists(cl.data);
        setCompletions(comp.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function completionFor(checklistId) {
    return completions.find((c) => c.checklist_id === checklistId && c.user_id === undefined) ||
      completions.find((c) => c.checklist_id === checklistId);
  }

  async function toggleItem(checklist, itemIndex) {
    const existing = completions.find((c) => c.checklist_id === checklist.id);
    const checked = new Set(existing?.checked_items || []);
    if (checked.has(itemIndex)) checked.delete(itemIndex); else checked.add(itemIndex);
    const checkedArr = Array.from(checked);
    const completed = checkedArr.length === checklist.items.length;
    await api.post(`/checklists/${checklist.id}/complete`, { checked_items: checkedArr, completed, date: today });
    load();
  }

  async function handleCreate(e) {
    e.preventDefault();
    const items = form.items.filter((i) => i.trim() !== '');
    await api.post('/checklists', { ...form, items });
    setForm(EMPTY_FORM);
    setShowForm(false);
    load();
  }

  async function handleDelete(id) {
    if (!confirm('Удалить чек-лист?')) return;
    await api.delete(`/checklists/${id}`);
    load();
  }

  function updateItem(idx, value) {
    const items = [...form.items];
    items[idx] = value;
    setForm({ ...form, items });
  }

  if (loading) return <div className="page-loading">Загрузка...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Чек-листы</h1>
        {isOwner && <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Новый чек-лист</button>}
      </div>
      <p className="page-subtitle">Ежедневные и периодические процедуры для сотрудников</p>

      <div className="grid grid-2">
        {checklists.map((checklist) => {
          const myCompletion = completions.find((c) => c.checklist_id === checklist.id);
          const checked = new Set(myCompletion?.checked_items || []);
          return (
            <div className="card" key={checklist.id}>
              <div className="card-header">
                <h3>{checklist.title}</h3>
                {myCompletion?.completed && <span className="badge badge-completed">Выполнено</span>}
              </div>
              {checklist.description && <p className="page-subtitle">{checklist.description}</p>}
              <ul className="checklist">
                {checklist.items.map((item, idx) => (
                  <li key={idx}>
                    <label>
                      <input type="checkbox" checked={checked.has(idx)} onChange={() => toggleItem(checklist, idx)} />
                      {item}
                    </label>
                  </li>
                ))}
              </ul>
              {isOwner && (
                <div className="modal-actions">
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(checklist.id)}>Удалить</button>
                </div>
              )}
            </div>
          );
        })}
        {checklists.length === 0 && <p className="empty-hint">Чек-листов пока нет</p>}
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <h3>Новый чек-лист</h3>
            <label className="field">
              <span>Название</span>
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="field">
              <span>Описание</span>
              <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="field">
              <span>Для кого</span>
              <select value={form.role_target} onChange={(e) => setForm({ ...form, role_target: e.target.value })}>
                <option value="master">Мастера</option>
                <option value="owner">Владелец</option>
                <option value="all">Все</option>
              </select>
            </label>
            <label className="field">
              <span>Пункты чек-листа</span>
              {form.items.map((item, idx) => (
                <input key={idx} value={item} onChange={(e) => updateItem(idx, e.target.value)} placeholder={`Пункт ${idx + 1}`} style={{ marginBottom: 6 }} />
              ))}
              <button type="button" className="btn btn-sm" onClick={() => setForm({ ...form, items: [...form.items, ''] })}>+ Добавить пункт</button>
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
