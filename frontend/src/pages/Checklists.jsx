import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const EMPTY_FORM = { name: '', description: '', items: [''] };

export default function Checklists() {
  const { isOwner } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [marks, setMarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [newItemLabel, setNewItemLabel] = useState({});
  const today = new Date().toISOString().slice(0, 10);

  function load() {
    setLoading(true);
    Promise.all([
      api.get('/modules/checklists/templates'),
      api.get('/modules/checklists/marks', { params: { date: today } }),
    ])
      .then(([tpl, m]) => {
        setTemplates(tpl.data);
        setMarks(m.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function marksForItem(itemId) {
    return marks.filter((m) => m.item_id === itemId && m.checked);
  }

  async function toggleItem(item, checked) {
    await api.post(`/modules/checklists/items/${item.id}/mark`, { checked, date: today });
    load();
  }

  async function handleCreate(e) {
    e.preventDefault();
    const { data: template } = await api.post('/modules/checklists/templates', { name: form.name, description: form.description });
    for (const label of form.items.filter((i) => i.trim() !== '')) {
      await api.post(`/modules/checklists/templates/${template.id}/items`, { label });
    }
    setForm(EMPTY_FORM);
    setShowForm(false);
    load();
  }

  async function handleDeleteTemplate(id) {
    if (!confirm('Удалить чек-лист?')) return;
    await api.delete(`/modules/checklists/templates/${id}`);
    load();
  }

  async function addItem(templateId) {
    const label = (newItemLabel[templateId] || '').trim();
    if (!label) return;
    await api.post(`/modules/checklists/templates/${templateId}/items`, { label });
    setNewItemLabel({ ...newItemLabel, [templateId]: '' });
    load();
  }

  async function deleteItem(itemId) {
    await api.delete(`/modules/checklists/items/${itemId}`);
    load();
  }

  function updateFormItem(idx, value) {
    const items = [...form.items];
    items[idx] = value;
    setForm({ ...form, items });
  }

  if (loading) return <div className="page-loading">Загрузка...</div>;

  const activeTemplates = templates.filter((t) => t.active);

  return (
    <div>
      <div className="page-header">
        <h1>Чек-листы</h1>
        {isOwner && <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Новый чек-лист</button>}
      </div>
      <p className="page-subtitle">
        {isOwner ? 'Шаблоны чек-листов и отметки выполнения мастерами за сегодня' : 'Ежедневные процедуры — отметьте выполненное'}
      </p>

      <div className="grid grid-2">
        {(isOwner ? templates : activeTemplates).map((template) => {
          const doneCount = template.items.filter((item) => marksForItem(item.id).length > 0).length;
          return (
            <div className="card" key={template.id}>
              <div className="card-header">
                <h3>{template.name}{!template.active && ' (отключён)'}</h3>
                {template.items.length > 0 && doneCount === template.items.length && (
                  <span className="badge badge-completed">Выполнено</span>
                )}
              </div>
              {template.description && <p className="page-subtitle">{template.description}</p>}

              {isOwner ? (
                <ul className="list">
                  {template.items.map((item) => (
                    <li key={item.id}>
                      {item.label}
                      {' — '}
                      <span className="page-subtitle" style={{ display: 'inline' }}>
                        {marksForItem(item.id).map((m) => m.master_name).join(', ') || 'не отмечено'}
                      </span>
                      <button className="btn btn-sm btn-ghost" onClick={() => deleteItem(item.id)}>✕</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="checklist">
                  {template.items.map((item) => (
                    <li key={item.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={marksForItem(item.id).length > 0}
                          onChange={(e) => toggleItem(item, e.target.checked)}
                        />
                        {item.label}
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              {isOwner && (
                <div className="row-actions" style={{ marginTop: '0.75rem' }}>
                  <input
                    className="field-inline"
                    style={{ flex: 1 }}
                    placeholder="Новый пункт"
                    value={newItemLabel[template.id] || ''}
                    onChange={(e) => setNewItemLabel({ ...newItemLabel, [template.id]: e.target.value })}
                  />
                  <button className="btn btn-sm" onClick={() => addItem(template.id)}>+ Пункт</button>
                </div>
              )}

              {isOwner && (
                <div className="modal-actions">
                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteTemplate(template.id)}>Удалить чек-лист</button>
                </div>
              )}
            </div>
          );
        })}
        {(isOwner ? templates : activeTemplates).length === 0 && <p className="empty-hint">Чек-листов пока нет</p>}
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <h3>Новый чек-лист</h3>
            <label className="field">
              <span>Название</span>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              <span>Описание</span>
              <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="field">
              <span>Пункты чек-листа</span>
              {form.items.map((item, idx) => (
                <input key={idx} value={item} onChange={(e) => updateFormItem(idx, e.target.value)} placeholder={`Пункт ${idx + 1}`} style={{ marginBottom: 6 }} />
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
