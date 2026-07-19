import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, ST, BackBtn, Field, TextInput, Btn, C } from '../ui/components.jsx';

const EMPTY_FORM = { name: '', address: '' };

export default function Branches() {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDel, setConfirmDel] = useState(null);

  function load() {
    setLoading(true);
    api.get('/platform/branches').then((res) => setBranches(res.data)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(b) {
    setForm({ name: b.name || '', address: b.address || '' });
    setEditingId(b.id);
    setShowForm(true);
  }

  async function submit() {
    if (!form.name.trim()) return;
    if (editingId) await api.patch(`/platform/branches/${editingId}`, form);
    else await api.post('/platform/branches', form);
    setShowForm(false);
    load();
  }

  async function handleDelete(id) {
    await api.delete(`/platform/branches/${id}`);
    setConfirmDel(null);
    load();
  }

  if (loading) return <div className="page-loading">Загрузка...</div>;

  if (showForm) {
    return (
      <div>
        <BackBtn onClick={() => setShowForm(false)} />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>{editingId ? 'Изменить филиал' : 'Новый филиал'}</div>
        <Field label="Название">
          <TextInput autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Студия на Тверской" />
        </Field>
        <Field label="Адрес">
          <TextInput value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="ул. Тверская, 1" />
        </Field>
        <Btn onClick={submit}>{editingId ? 'Сохранить изменения' : 'Добавить'}</Btn>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Филиалы</div>
        <button onClick={openCreate} style={{ background: C.primary, color: '#FFF', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Добавить</button>
      </div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 16 }}>
        Филиалы можно назначать мастерам и указывать в приглашениях — например, если у студии несколько адресов.
      </div>

      <Card>
        <ST>Список · {branches.length}</ST>
        {branches.map((b, i, arr) => (
          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{b.name}</div>
              {b.address && <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>{b.address}</div>}
            </div>
            {confirmDel === b.id ? (
              <div style={{ display: 'flex', gap: 4 }}>
                <Btn small variant="red" onClick={() => handleDelete(b.id)}>Удалить</Btn>
                <Btn small variant="secondary" onClick={() => setConfirmDel(null)}>Отмена</Btn>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => openEdit(b)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.secondary }}>Изменить</button>
                <button onClick={() => setConfirmDel(b.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.red }}>Удалить</button>
              </div>
            )}
          </div>
        ))}
        {branches.length === 0 && <div style={{ padding: '16px 0', textAlign: 'center', color: C.subtle, fontSize: 13 }}>Филиалов пока нет — всё в одном месте</div>}
      </Card>
    </div>
  );
}
