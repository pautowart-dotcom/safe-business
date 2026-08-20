import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, Field, TextInput, TextArea, Select, Btn, C } from '../ui/components.jsx';

// Модуль "Заявки" (20.08.2026) — первый повод: клининг, владелица сама
// разбирает входящие заявки без менеджера продаж. Сознательно простой список
// со статусом, без конвертации в клиента (см. leads.routes.js) — маленький,
// обратимый первый шаг, дорабатывается по реальной обратной связи, а не
// заранее продуманная воронка со всеми возможными полями.
const STATUS_LABELS = { new: 'Новый', contacted: 'Связались', ordered: 'Заказ', paid: 'Оплачено' };
const STATUS_ORDER = ['new', 'contacted', 'ordered', 'paid'];
const CLIENT_TYPE_LABELS = { individual: 'Физлицо', legal_entity: 'Юрлицо' };
const EMPTY_FORM = { name: '', phone: '', clientType: 'individual', comment: '' };

function nextStatus(status) {
  const i = STATUS_ORDER.indexOf(status);
  return i >= 0 && i < STATUS_ORDER.length - 1 ? STATUS_ORDER[i + 1] : null;
}

function LeadCard({ lead, onAdvance, onStatusChange, onDelete }) {
  const next = nextStatus(lead.status);
  const paid = lead.status === 'paid';
  return (
    <Card style={{ opacity: paid ? 0.6 : 1, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{lead.name}</div>
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>
            {CLIENT_TYPE_LABELS[lead.client_type] || lead.client_type}{lead.phone ? ` · ${lead.phone}` : ''}
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: paid ? C.green : C.primary, textAlign: 'right', whiteSpace: 'nowrap' }}>
          {STATUS_LABELS[lead.status] || lead.status}
        </div>
      </div>
      {lead.comment && <div style={{ fontSize: 13, color: C.secondary, marginTop: 8 }}>{lead.comment}</div>}
      <div style={{ fontSize: 11, color: C.subtle, marginTop: 8 }}>
        {new Date(lead.created_at).toLocaleDateString('ru-RU')}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {next && <Btn small onClick={() => onAdvance(lead.id, next)}>→ {STATUS_LABELS[next]}</Btn>}
        <Select value={lead.status} onChange={(e) => onStatusChange(lead.id, e.target.value)} style={{ width: 'auto', padding: '8px 10px', fontSize: 13 }}>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </Select>
        <Btn small variant="secondary" onClick={() => onDelete(lead.id)}>Удалить</Btn>
      </div>
    </Card>
  );
}

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    return api.get('/modules/leads').then((res) => setLeads(res.data)).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd() {
    if (!form.name.trim()) {
      setError('Укажите имя или название клиента');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/modules/leads', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось добавить заявку');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(id, status) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    try {
      await api.patch(`/modules/leads/${id}`, { status });
    } catch {
      load();
    }
  }

  async function handleDelete(id) {
    if (!confirm('Удалить заявку?')) return;
    setLeads((prev) => prev.filter((l) => l.id !== id));
    try {
      await api.delete(`/modules/leads/${id}`);
    } catch {
      load();
    }
  }

  if (loading) return <div className="page-loading">Загрузка...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Заявки</div>
        <Btn small onClick={() => setShowForm((v) => !v)}>{showForm ? 'Отмена' : '+ Новая заявка'}</Btn>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}
          <Field label="Имя / название">
            <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Мария Иванова или ООО «Ромашка»" />
          </Field>
          <Field label="Телефон">
            <TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+7 900 123-45-67" />
          </Field>
          <Field label="Тип клиента">
            <Select value={form.clientType} onChange={(e) => setForm({ ...form, clientType: e.target.value })}>
              <option value="individual">Физлицо</option>
              <option value="legal_entity">Юрлицо</option>
            </Select>
          </Field>
          <Field label="Комментарий">
            <TextArea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Что нужно, откуда узнали, детали..." />
          </Field>
          <Btn onClick={handleAdd} disabled={saving}>{saving ? 'Сохраняю...' : 'Добавить'}</Btn>
        </Card>
      )}

      {leads.length === 0 && <div className="empty-hint">Заявок пока нет — добавьте первую кнопкой выше</div>}
      {leads.map((lead) => (
        <LeadCard
          key={lead.id}
          lead={lead}
          onAdvance={(id, status) => handleStatusChange(id, status)}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}
