import { useEffect, useRef, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, BackBtn, Field, TextInput, TextArea, Btn, Avatar, C } from '../ui/components.jsx';
import { downloadPdf } from '../utils/downloadPdf.js';

const EMPTY_FORM = { firstName: '', lastName: '', phone: '', preferences: '', notes: '', allergies: '' };

export default function Clients() {
  const { isManagement } = useAuth();
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [dossierError, setDossierError] = useState('');
  const firstNameRef = useRef(null);

  function load(searchTerm) {
    setLoading(true);
    return api
      .get('/modules/clients', { params: searchTerm ? { search: searchTerm } : {} })
      .then((res) => setClients(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timer = setTimeout(() => load(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const refresh = () => load(search);
  usePullToRefresh(refresh);

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
      preferences: client.preferences || '',
      notes: client.notes || '',
      allergies: client.allergies || '',
    });
    setEditingId(client.id);
    setSelected(null);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.lastName.trim() || !form.firstName.trim()) return;
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
    setSelected(null);
    load(search);
  }

  if (showForm) {
    return (
      <div>
        <BackBtn onClick={() => setShowForm(false)} />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>{editingId ? 'Изменить клиента' : 'Новый клиент'}</div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Фамилия">
              <TextInput
                autoFocus
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); firstNameRef.current?.focus(); } }}
                placeholder="Иванова"
              />
            </Field>
            <Field label="Имя">
              <TextInput ref={firstNameRef} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Анна" />
            </Field>
          </div>
          <Field label="Телефон">
            <TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+7 900 000-00-00" />
          </Field>
          <Field label="Пожелания">
            <TextArea value={form.preferences} onChange={(e) => setForm({ ...form, preferences: e.target.value })} placeholder="Например: любит крепкий кофе, не любит разговоры во время процедуры" />
          </Field>
          <Field label="Замечания">
            <TextArea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Например: часто опаздывает, просил напоминать заранее" />
          </Field>
          <Field label="Аллергии">
            <TextArea value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} placeholder="Например: аллергия на латекс" />
          </Field>
          <Btn type="submit">Сохранить клиента</Btn>
        </form>
      </div>
    );
  }

  if (selected) {
    return (
      <div>
        <BackBtn onClick={() => setSelected(null)} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <Avatar letter={selected.last_name?.[0]} size={52} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{selected.last_name} {selected.first_name}</div>
            {selected.phone && <div style={{ fontSize: 13, color: C.subtle }}>{selected.phone}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <Btn small onClick={() => openEdit(selected)}>Изменить</Btn>
          <Btn small variant="secondary" onClick={() => handleDelete(selected.id)}>Удалить</Btn>
          {isManagement && (
            <Btn
              small
              variant="secondary"
              onClick={() => downloadPdf(`/platform/dossier/client/${selected.id}/export`, `dossier-${selected.last_name}.pdf`, setDossierError)}
            >
              Сформировать досье
            </Btn>
          )}
        </div>
        {dossierError && <div className="alert alert-error">{dossierError}</div>}
        {selected.allergies && (
          <Card style={{ background: C.redBg, borderColor: `${C.red}33` }}>
            <div style={{ fontSize: 12, color: C.red, fontWeight: 700, marginBottom: 4 }}>⚠️ Аллергии</div>
            <div style={{ fontSize: 13, color: C.secondary, whiteSpace: 'pre-wrap' }}>{selected.allergies}</div>
          </Card>
        )}
        {selected.preferences && (
          <Card>
            <div style={{ fontSize: 12, color: C.subtle, fontWeight: 700, marginBottom: 4 }}>Пожелания</div>
            <div style={{ fontSize: 13, color: C.secondary, whiteSpace: 'pre-wrap' }}>{selected.preferences}</div>
          </Card>
        )}
        {selected.notes && (
          <Card>
            <div style={{ fontSize: 12, color: C.subtle, fontWeight: 700, marginBottom: 4 }}>Замечания</div>
            <div style={{ fontSize: 13, color: C.secondary, whiteSpace: 'pre-wrap' }}>{selected.notes}</div>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Клиенты</div>
        <button onClick={openCreate} style={{ background: C.primary, color: '#FFF', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Клиент</button>
      </div>
      <TextInput placeholder="Поиск по фамилии или имени" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12 }} />

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : (
        <Card style={{ padding: 0 }}>
          {clients.map((c, i) => (
            <div
              key={c.id}
              onClick={() => setSelected(c)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', borderBottom: i < clients.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar letter={c.last_name?.[0]} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{c.last_name} {c.first_name}</div>
                  {c.phone && <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>{c.phone}</div>}
                </div>
              </div>
              <span style={{ fontSize: 20, color: C.border }}>›</span>
            </div>
          ))}
          {clients.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: C.subtle, fontSize: 14 }}>Клиенты не найдены</div>}
        </Card>
      )}
    </div>
  );
}
