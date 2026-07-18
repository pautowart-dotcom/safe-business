import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, BackBtn, Field, TextInput, TextArea, Btn, Icon, C } from '../ui/components.jsx';

const EMPTY_FORM = { name: '', description: '', items: [''] };
const ROLE_LABELS = { owner: 'владелец', master: 'мастер' };

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export default function Checklists() {
  const { isOwner } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [marks, setMarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [newItemLabel, setNewItemLabel] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  function load() {
    setLoading(true);
    Promise.all([api.get('/modules/checklists/templates'), api.get('/modules/checklists/marks', { params: { date: today } })])
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

  async function handleCreate() {
    if (!form.name.trim()) return;
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
    setEditingTemplate(null);
    load();
  }

  async function addItem(templateId) {
    if (!newItemLabel.trim()) return;
    await api.post(`/modules/checklists/templates/${templateId}/items`, { label: newItemLabel.trim() });
    setNewItemLabel('');
    load();
  }

  async function deleteItem(itemId) {
    await api.delete(`/modules/checklists/items/${itemId}`);
    load();
  }

  async function saveTemplateName(name) {
    if (!name.trim() || name === editingTemplate.name) return;
    await api.patch(`/modules/checklists/templates/${editingTemplate.id}`, { name: name.trim() });
    setEditingTemplate({ ...editingTemplate, name: name.trim() });
    load();
  }

  async function saveTemplateDescription(description) {
    if (description === (editingTemplate.description || '')) return;
    await api.patch(`/modules/checklists/templates/${editingTemplate.id}`, { description });
    setEditingTemplate({ ...editingTemplate, description });
    load();
  }

  async function saveItemLabel(item, label) {
    if (!label.trim() || label === item.label) return;
    await api.patch(`/modules/checklists/items/${item.id}`, { label: label.trim() });
    setEditingTemplate({ ...editingTemplate, items: editingTemplate.items.map((x) => (x.id === item.id ? { ...x, label: label.trim() } : x)) });
    load();
  }

  function updateFormItem(idx, value) {
    const items = [...form.items];
    items[idx] = value;
    setForm({ ...form, items });
  }

  if (loading) return <div className="page-loading">Загрузка...</div>;

  if (showForm) {
    return (
      <div>
        <BackBtn onClick={() => setShowForm(false)} />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Новый чек-лист</div>
        <Field label="Название"><TextInput autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Открытие смены" /></Field>
        <Field label="Описание"><TextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Пункты чек-листа">
          {form.items.map((item, idx) => (
            <TextInput key={idx} value={item} onChange={(e) => updateFormItem(idx, e.target.value)} placeholder={`Пункт ${idx + 1}`} style={{ marginBottom: 8 }} />
          ))}
          <Btn small variant="secondary" onClick={() => setForm({ ...form, items: [...form.items, ''] })}>+ Добавить пункт</Btn>
        </Field>
        <Btn onClick={handleCreate}>Сохранить</Btn>
      </div>
    );
  }

  if (editingTemplate) {
    return (
      <div>
        <BackBtn onClick={() => setEditingTemplate(null)} />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Редактировать чек-лист</div>
        <Field label="Название">
          <TextInput
            value={editingTemplate.name}
            onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
            onBlur={(e) => saveTemplateName(e.target.value)}
          />
        </Field>
        <Field label="Описание">
          <TextArea
            value={editingTemplate.description || ''}
            onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
            onBlur={(e) => saveTemplateDescription(e.target.value)}
          />
        </Field>
        <Card style={{ padding: 0 }}>
          {editingTemplate.items.map((item, i) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: i < editingTemplate.items.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <TextInput
                value={item.label}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, items: editingTemplate.items.map((x) => (x.id === item.id ? { ...x, label: e.target.value } : x)) })}
                onBlur={(e) => saveItemLabel(item, e.target.value)}
                style={{ flex: 1 }}
              />
              <button onClick={() => deleteItem(item.id).then(() => setEditingTemplate({ ...editingTemplate, items: editingTemplate.items.filter((x) => x.id !== item.id) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <Icon name="trash" size={16} color={C.red} />
              </button>
            </div>
          ))}
        </Card>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, marginBottom: 16 }}>
          <TextInput placeholder="Новый пункт..." value={newItemLabel} onChange={(e) => setNewItemLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(editingTemplate.id); } }} />
          <Btn small onClick={() => addItem(editingTemplate.id)}>+ Добавить</Btn>
        </div>
        <Btn variant="secondary" onClick={() => handleDeleteTemplate(editingTemplate.id)}>Удалить чек-лист</Btn>
      </div>
    );
  }

  const visibleTemplates = isOwner ? templates : templates.filter((t) => t.active);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Чек-листы</div>
        {isOwner && <button onClick={() => setShowForm(true)} style={{ background: C.primary, color: '#FFF', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Новый</button>}
      </div>

      {visibleTemplates.length === 0 && <div className="empty-hint">Чек-листов пока нет</div>}

      {visibleTemplates.map((template) => {
        const doneCount = template.items.filter((item) => marksForItem(item.id).length > 0).length;
        const pct = template.items.length > 0 ? Math.round((doneCount / template.items.length) * 100) : 0;
        const allMarksToday = template.items
          .flatMap((item) => marksForItem(item.id))
          .sort((a, b) => new Date(a.checked_at) - new Date(b.checked_at));
        const firstMark = allMarksToday[0];
        const lastMark = doneCount === template.items.length && template.items.length > 0 ? allMarksToday[allMarksToday.length - 1] : null;
        return (
          <Card key={template.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{template.name}{!template.active && ' (отключён)'}</div>
                {template.description && <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>{template.description}</div>}
              </div>
              {isOwner && (
                <button onClick={() => setEditingTemplate(template)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="edit" size={13} color={C.secondary} />Изменить
                </button>
              )}
            </div>

            {isOwner ? (
              <div>
                {firstMark && (
                  <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>
                    Начало: {firstMark.master_name || '—'} ({ROLE_LABELS[firstMark.member_role] || firstMark.member_role}) · {formatTime(firstMark.checked_at)}
                    {lastMark && (
                      <>
                        {' · '}Завершено: {lastMark.master_name || '—'} ({ROLE_LABELS[lastMark.member_role] || lastMark.member_role}) · {formatTime(lastMark.checked_at)}
                      </>
                    )}
                  </div>
                )}
                {template.items.map((item, i) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < template.items.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <span style={{ fontSize: 14 }}>{item.label}</span>
                    <span style={{ fontSize: 12, color: C.subtle }}>
                      {marksForItem(item.id).map((m) => `${m.master_name} (${ROLE_LABELS[m.member_role] || m.member_role}), ${formatTime(m.checked_at)}`).join(' · ') || 'не отмечено'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{doneCount} из {template.items.length}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: pct === 100 ? C.green : C.primary }}>{pct}%</div>
                </div>
                <div style={{ height: 5, background: C.surface, borderRadius: 3, overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? C.green : C.primary, borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
                {template.items.map((item, i) => {
                  const isDone = marksForItem(item.id).length > 0;
                  return (
                    <div key={item.id} onClick={() => toggleItem(item, !isDone)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderBottom: i < template.items.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }}>
                      <div style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, border: `2px solid ${isDone ? C.primary : C.border}`, background: isDone ? C.primary : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isDone && <Icon name="check" size={13} color="#FFF" sw={2.5} />}
                      </div>
                      <span style={{ fontSize: 15, color: isDone ? C.subtle : C.primary, textDecoration: isDone ? 'line-through' : 'none' }}>{item.label}</span>
                    </div>
                  );
                })}
                {pct === 100 && template.items.length > 0 && <div style={{ fontSize: 13, color: C.green, marginTop: 12, fontWeight: 700, textAlign: 'center' }}>✓ Всё готово!</div>}
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
