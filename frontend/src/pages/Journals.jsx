import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Field, TextInput, Select, Btn, C } from '../ui/components.jsx';
import { downloadPdf } from '../utils/downloadPdf.js';
import PrintedJournalsTab from './PrintedJournals.jsx';

// Пакет 3, Этап 5: журналы УФ-лампы и инструктажа. Дисклеймер (обязательный
// под каждым журналом) и заголовки — из БД (journal_types), не зашиты в
// код, редактируются Super Admin'ом (см. AdminJournalTypes.jsx).

function toLocalInputValue(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function nowLocal() {
  return toLocalInputValue(new Date());
}

function Disclaimer({ text }) {
  if (!text) return null;
  return <div style={{ fontSize: 11, color: C.subtle, fontStyle: 'italic', marginTop: 4, marginBottom: 16 }}>{text}</div>;
}

function UvLampTab({ type, roster, isManagement, error, setError }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ action: 'on', membershipId: '', occurredAt: nowLocal() });
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    return api.get('/platform/journals/uv-lamp').then((res) => setEntries(res.data)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function submit() {
    if (!form.membershipId) {
      setError('Выберите ответственного');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/platform/journals/uv-lamp', {
        action: form.action,
        membershipId: Number(form.membershipId),
        occurredAt: new Date(form.occurredAt).toISOString(),
      });
      setForm({ action: 'on', membershipId: '', occurredAt: nowLocal() });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить запись');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Disclaimer text={type?.disclaimer} />
      <Card>
        <Field label="Действие">
          <Select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
            <option value="on">Включил</option>
            <option value="off">Выключил</option>
          </Select>
        </Field>
        <Field label="Ответственный">
          <Select value={form.membershipId} onChange={(e) => setForm({ ...form, membershipId: e.target.value })}>
            <option value="">Выберите сотрудника</option>
            {roster.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Время">
          <TextInput type="datetime-local" value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} />
        </Field>
        <Btn onClick={submit} disabled={saving}>{saving ? 'Сохраняем...' : 'Добавить запись'}</Btn>
      </Card>

      {isManagement && (
        <Btn variant="secondary" small style={{ marginBottom: 16 }} onClick={() => downloadPdf('/platform/journals/uv-lamp/export', 'uv-lamp-journal.pdf', setError)}>
          Экспорт в PDF
        </Btn>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : entries.length === 0 ? (
        <div className="empty-hint">Записей пока нет</div>
      ) : (
        entries.map((e) => (
          <Card key={e.id}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{e.action === 'on' ? 'Включил' : 'Выключил'} — {e.membership_name || 'Сотрудник'}</div>
            <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>{new Date(e.occurred_at).toLocaleString('ru-RU')}</div>
          </Card>
        ))
      )}
    </div>
  );
}

function BriefingTab({ type, roster, isManagement, error, setError }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ conductorMembershipId: '', recipientMembershipId: '', topic: '' });
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    return api.get('/platform/journals/briefing').then((res) => setEntries(res.data)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function submit() {
    if (!form.conductorMembershipId || !form.recipientMembershipId) {
      setError('Выберите, кто провёл инструктаж и кто его получил');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/platform/journals/briefing', {
        conductorMembershipId: Number(form.conductorMembershipId),
        recipientMembershipId: Number(form.recipientMembershipId),
        topic: form.topic || undefined,
      });
      setForm({ conductorMembershipId: '', recipientMembershipId: '', topic: '' });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить запись');
    } finally {
      setSaving(false);
    }
  }

  async function confirm(id) {
    setError('');
    try {
      await api.patch(`/platform/journals/briefing/${id}/confirm`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось подтвердить');
    }
  }

  return (
    <div>
      <Disclaimer text={type?.disclaimer} />
      <Card>
        <Field label="Кто провёл инструктаж">
          <Select value={form.conductorMembershipId} onChange={(e) => setForm({ ...form, conductorMembershipId: e.target.value })}>
            <option value="">Выберите сотрудника</option>
            {roster.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Кто получил инструктаж">
          <Select value={form.recipientMembershipId} onChange={(e) => setForm({ ...form, recipientMembershipId: e.target.value })}>
            <option value="">Выберите сотрудника</option>
            {roster.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Тема (необязательно)">
          <TextInput value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="Например, техника безопасности при работе с УФ-лампой" />
        </Field>
        <Btn onClick={submit} disabled={saving}>{saving ? 'Сохраняем...' : 'Добавить запись'}</Btn>
      </Card>

      {isManagement && (
        <Btn variant="secondary" small style={{ marginBottom: 16 }} onClick={() => downloadPdf('/platform/journals/briefing/export', 'briefing-journal.pdf', setError)}>
          Экспорт в PDF
        </Btn>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : entries.length === 0 ? (
        <div className="empty-hint">Записей пока нет</div>
      ) : (
        entries.map((e) => (
          <Card key={e.id}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{e.topic || 'Инструктаж на рабочем месте'}</div>
            <div style={{ fontSize: 12, color: C.subtle, marginBottom: 4 }}>
              Провёл: {e.conductor_name || 'Сотрудник'} — {e.conductor_confirmed_at ? `подтвердил ${new Date(e.conductor_confirmed_at).toLocaleString('ru-RU')}` : 'не подтверждено'}
            </div>
            <div style={{ fontSize: 12, color: C.subtle, marginBottom: 8 }}>
              Получил: {e.recipient_name || 'Сотрудник'} — {e.recipient_confirmed_at ? `подтвердил ${new Date(e.recipient_confirmed_at).toLocaleString('ru-RU')}` : 'не подтверждено'}
            </div>
            {e.you_are_conductor && !e.conductor_confirmed_at && (
              <Btn small onClick={() => confirm(e.id)}>Подтверждаю (провёл)</Btn>
            )}
            {e.you_are_recipient && !e.recipient_confirmed_at && (
              <Btn small onClick={() => confirm(e.id)} style={{ marginTop: e.you_are_conductor ? 8 : 0 }}>Подтверждаю (получил)</Btn>
            )}
          </Card>
        ))
      )}
    </div>
  );
}

// Только чтение: записи появляются сами из истории списаний/приходов
// расходников с тегом "дезинфицирующее средство" (Supplies.jsx), никакого
// ручного ввода здесь нет — см. GET /platform/journals/disinfectant-log.
function DisinfectantLogTab({ type, isManagement, error, setError }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/platform/journals/disinfectant-log').then((res) => setEntries(res.data)).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <Disclaimer text={type?.disclaimer} />
      <div style={{ fontSize: 12, color: C.subtle, marginBottom: 16 }}>
        Формируется автоматически из прихода/списания расходников, помеченных тегом "Дезсредство" в разделе "Склад расходников".
      </div>

      {isManagement && (
        <Btn variant="secondary" small style={{ marginBottom: 16 }} onClick={() => downloadPdf('/platform/journals/disinfectant-log/export', 'disinfectant-journal.pdf', setError)}>
          Экспорт в PDF
        </Btn>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : entries.length === 0 ? (
        <div className="empty-hint">Записей пока нет — отметьте расходник тегом "Дезсредство" на складе</div>
      ) : (
        entries.map((e) => (
          <Card key={e.id}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{e.type === 'in' ? 'Приход' : 'Списание'} — {e.supply_name} ({Number(e.quantity)} {e.unit})</div>
            <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>{e.user_name || '—'} · {new Date(e.created_at).toLocaleString('ru-RU')}</div>
          </Card>
        ))
      )}
    </div>
  );
}

const TABS = [
  { key: 'uv_lamp', fallbackLabel: 'УФ-лампа' },
  { key: 'briefing', fallbackLabel: 'Инструктаж' },
  { key: 'disinfectant_log', fallbackLabel: 'Дезсредства' },
];

export default function Journals() {
  const { isManagement } = useAuth();
  const [tab, setTab] = useState('uv_lamp');
  const [types, setTypes] = useState({});
  const [roster, setRoster] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/platform/journals/types').then((res) => setTypes(Object.fromEntries(res.data.map((t) => [t.key, t]))));
    api.get('/platform/memberships/roster').then((res) => setRoster(res.data));
  }, []);

  // Пакет 4, Этап 3: "Печатные бланки" — management-only (создание/просмотр
  // на бэкенде тоже requireRole('owner','admin')), поэтому мастеру эту
  // вкладку вообще не показываем, а не показываем и сразу ломаем ошибками.
  const allTabs = isManagement ? [...TABS, { key: 'printed', fallbackLabel: 'Печатные бланки' }] : TABS;

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Журналы</div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto' }}>
        {allTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, flexShrink: 0, padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'pointer',
              background: tab === t.key ? C.primary : C.bg, color: tab === t.key ? '#FFF' : C.secondary, fontSize: 13, fontWeight: 600,
            }}
          >
            {types[t.key]?.title || t.fallbackLabel}
          </button>
        ))}
      </div>

      {tab === 'uv_lamp' && (
        <UvLampTab type={types.uv_lamp} roster={roster} isManagement={isManagement} error={error} setError={setError} />
      )}
      {tab === 'briefing' && (
        <BriefingTab type={types.briefing} roster={roster} isManagement={isManagement} error={error} setError={setError} />
      )}
      {tab === 'disinfectant_log' && (
        <DisinfectantLogTab type={types.disinfectant_log} isManagement={isManagement} error={error} setError={setError} />
      )}
      {tab === 'printed' && isManagement && <PrintedJournalsTab setError={setError} />}
    </div>
  );
}
