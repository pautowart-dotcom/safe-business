import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, BackBtn, Field, TextInput, TextArea, Select, Btn, Icon, C } from '../ui/components.jsx';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const EMPTY_FORM = { title: '', note: '', eventTime: '', remind: false, membershipId: '' };

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // понедельник = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}

export default function CalendarPage() {
  const { isManagement } = useAuth();
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(toDateStr(today));
  const [events, setEvents] = useState([]);
  const [masters, setMasters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);

  function load() {
    setLoading(true);
    const from = toDateStr(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    const to = toDateStr(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));
    return api.get('/platform/calendar', { params: { from, to } }).then((res) => setEvents(res.data)).finally(() => setLoading(false));
  }

  useEffect(load, [cursor]);

  useEffect(() => {
    if (!isManagement) return;
    api.get('/platform/memberships').then((res) => setMasters(res.data.filter((m) => m.role === 'master' && m.user_id)));
  }, [isManagement]);

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
  }

  function openEdit(ev) {
    setForm({
      title: ev.title,
      note: ev.note || '',
      eventTime: ev.event_time ? ev.event_time.slice(0, 5) : '',
      remind: ev.remind,
      membershipId: ev.membership_id || '',
    });
    setEditingId(ev.id);
    setSelectedDate(ev.event_date);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const payload = {
      title: form.title.trim(),
      note: form.note || null,
      eventDate: selectedDate,
      eventTime: form.eventTime || null,
      remind: form.remind,
      membershipId: isManagement ? form.membershipId || null : undefined,
    };
    if (editingId) {
      await api.patch(`/platform/calendar/${editingId}`, payload);
    } else {
      await api.post('/platform/calendar', payload);
    }
    setForm(null);
    setEditingId(null);
    load();
  }

  async function handleDelete(id) {
    if (!confirm('Удалить событие?')) return;
    await api.delete(`/platform/calendar/${id}`);
    setForm(null);
    setEditingId(null);
    load();
  }

  const cells = monthGrid(cursor.getFullYear(), cursor.getMonth());
  const eventsByDate = {};
  for (const ev of events) (eventsByDate[ev.event_date] ||= []).push(ev);
  const dayEvents = (eventsByDate[selectedDate] || []).slice().sort((a, b) => (a.event_time || '99:99').localeCompare(b.event_time || '99:99'));
  const monthLabel = cursor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  if (form) {
    return (
      <div>
        <BackBtn onClick={() => { setForm(null); setEditingId(null); }} />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>
          {editingId ? 'Изменить событие' : 'Новое событие'} · {new Date(selectedDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
        </div>
        <form onSubmit={handleSubmit}>
          <Field label="Заголовок">
            <TextInput autoFocus required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Смена, встреча, напоминание..." />
          </Field>
          <Field label="Время (необязательно)">
            <TextInput type="time" value={form.eventTime} onChange={(e) => setForm({ ...form, eventTime: e.target.value })} />
          </Field>
          <Field label="Заметка">
            <TextArea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Детали..." />
          </Field>
          {isManagement && (
            <Field label="Кому">
              <Select value={form.membershipId} onChange={(e) => setForm({ ...form, membershipId: e.target.value })}>
                <option value="">Общее событие компании</option>
                {masters.map((m) => <option key={m.id} value={m.id}>{m.user_name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.remind} onChange={(e) => setForm({ ...form, remind: e.target.checked })} />
              <span style={{ fontSize: 13, color: C.secondary }}>Напомнить</span>
            </label>
          </Field>
          <Btn type="submit">{editingId ? 'Сохранить изменения' : 'Добавить событие'}</Btn>
          {editingId && (
            <div style={{ marginTop: 10 }}>
              <Btn variant="secondary" onClick={() => handleDelete(editingId)}>Удалить событие</Btn>
            </div>
          )}
        </form>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}>
          <Icon name="arrow" size={16} color={C.secondary} />
        </button>
        <div style={{ fontSize: 16, fontWeight: 800, textTransform: 'capitalize' }}>{monthLabel}</div>
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, transform: 'rotate(180deg)' }}>
          <Icon name="arrow" size={16} color={C.secondary} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
        {WEEKDAYS.map((w) => <div key={w} style={{ textAlign: 'center', fontSize: 11, color: C.subtle, fontWeight: 700 }}>{w}</div>)}
      </div>

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 20 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const dateStr = toDateStr(d);
            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === toDateStr(today);
            const hasEvents = !!eventsByDate[dateStr]?.length;
            return (
              <div
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                style={{
                  aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 10, cursor: 'pointer',
                  background: isSelected ? C.primary : 'transparent',
                  border: isToday && !isSelected ? `1.5px solid ${C.primary}` : 'none',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: isSelected || isToday ? 700 : 400, color: isSelected ? '#FFF' : C.primary }}>{d.getDate()}</span>
                {hasEvents && <div style={{ width: 4, height: 4, borderRadius: '50%', background: isSelected ? '#FFF' : C.primary, marginTop: 2 }} />}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{new Date(selectedDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })}</div>
        <button onClick={openCreate} style={{ background: C.primary, color: '#FFF', border: 'none', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Событие</button>
      </div>

      {dayEvents.length === 0 ? (
        <div className="empty-hint">Событий нет</div>
      ) : (
        <Card style={{ padding: 0 }}>
          {dayEvents.map((ev, i) => (
            <div key={ev.id} onClick={() => openEdit(ev)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: i < dayEvents.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }}>
              <div style={{ width: 46, flexShrink: 0, fontSize: 12, color: C.subtle }}>{ev.event_time ? ev.event_time.slice(0, 5) : ''}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{ev.title}{ev.remind && ' 🔔'}</div>
                {(ev.note || ev.member_name) && (
                  <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>
                    {ev.member_name ? `${ev.member_name}${ev.note ? ' · ' : ''}` : ''}{ev.note || ''}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 20, color: C.border }}>›</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
