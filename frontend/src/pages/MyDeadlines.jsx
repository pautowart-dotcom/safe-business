import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { Card, ST, Field, TextInput, Select, Btn, C } from '../ui/components.jsx';

// Пакет 4, Этап 2: "Мои сроки" — вкладка внутри "Безопасности", где владелец
// по желанию вносит конкретные даты для календаря ("Дедлайны"). Всё
// опционально: не заполнено поле — просто нет напоминания, без блокировок
// (см. docs/task-batch-4.txt, принцип 2).

const RECURRENCE_OPTIONS = [
  { value: '', label: 'Без периодичности' },
  { value: 'monthly', label: 'Раз в месяц' },
  { value: 'quarterly', label: 'Раз в квартал' },
  { value: 'half_year', label: 'Раз в полгода' },
  { value: 'yearly', label: 'Раз в год' },
];

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Карточка одного пункта — дата/периодичность/заметка, все поля опциональны.
// Сохраняем только по клику "Сохранить", чтобы не слать запрос на каждое
// нажатие клавиши в заметке.
function SlotCard({ slot, onSave, saving }) {
  const [dueDate, setDueDate] = useState(slot.dueDate || '');
  const [recurrence, setRecurrence] = useState(slot.recurrence || '');
  const [note, setNote] = useState(slot.note || '');

  const dirty = dueDate !== (slot.dueDate || '') || recurrence !== (slot.recurrence || '') || note !== (slot.note || '');

  return (
    <Card>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{slot.label}</div>
      <Field label="Дата">
        <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>
      <Field label="Периодичность (необязательно)">
        <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
          {RECURRENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
      <Field label="Заметка / контакт подрядчика (необязательно)">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например, телефон обслуживающей организации" />
      </Field>
      <Btn small disabled={!dirty || saving} onClick={() => onSave(slot.key, { dueDate: dueDate || null, recurrence: recurrence || null, note: note || null })}>
        {saving ? 'Сохраняем...' : 'Сохранить'}
      </Btn>
    </Card>
  );
}

export default function MyDeadlinesTab() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [taxDeadlines, setTaxDeadlines] = useState([]);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState(null);
  const [soutLastAt, setSoutLastAt] = useState('');
  const [savingSout, setSavingSout] = useState(false);
  const [taxForm, setTaxForm] = useState({ regime: '', ipRegisteredAt: '', hasEmployees: false });
  const [savingTax, setSavingTax] = useState(false);

  function load() {
    return api.get('/platform/my-deadlines').then((res) => {
      setData(res.data);
      setSoutLastAt(res.data.sout.lastAt || '');
      setTaxForm({
        regime: res.data.tax.regime || '',
        ipRegisteredAt: res.data.tax.ipRegisteredAt || '',
        hasEmployees: !!res.data.tax.hasEmployees,
      });
    });
  }

  useEffect(() => {
    load();
    api.get('/platform/deadlines', { params: { category: 'tax' } }).then((res) => setTaxDeadlines(res.data));
  }, []);

  async function saveSlot(key, payload) {
    setSavingKey(key);
    setError('');
    try {
      await api.patch(`/platform/my-deadlines/slots/${key}`, payload);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSavingKey(null);
    }
  }

  async function saveSout() {
    setSavingSout(true);
    setError('');
    try {
      await api.patch('/platform/my-deadlines/sout', { lastAt: soutLastAt || null });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSavingSout(false);
    }
  }

  async function saveTax() {
    setSavingTax(true);
    setError('');
    try {
      const { data: company } = await api.patch('/platform/companies/current', {
        taxRegime: taxForm.regime || '',
        ipRegisteredAt: taxForm.ipRegisteredAt || '',
        hasEmployees: taxForm.hasEmployees,
      });
      setTaxForm({ regime: company.tax_regime || '', ipRegisteredAt: company.ip_registered_at || '', hasEmployees: !!company.has_employees });
      const res = await api.get('/platform/deadlines', { params: { category: 'tax' } });
      setTaxDeadlines(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSavingTax(false);
    }
  }

  if (!data) return <div className="page-loading">Загрузка...</div>;

  const byCategory = Object.fromEntries(['staff', 'premises', 'documents'].map((c) => [c, data.slots.filter((s) => s.category === c)]));
  // Патент актуален только при этом режиме — не показываем поле остальным,
  // чтобы не путать людей без патента.
  const documentsSlots = byCategory.documents.filter((s) => s.key !== 'patent_end' || taxForm.regime === 'patent');

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}

      <ST>Кадровые</ST>
      <Card>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Медицинские книжки и срочные договоры сотрудников</div>
        <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>Вносятся отдельно по каждому сотруднику в разделе «Команда».</div>
        <Btn small variant="secondary" onClick={() => navigate('/team')}>Перейти в «Команда»</Btn>
      </Card>
      <Card>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>СОУТ — спецоценка условий труда</div>
        <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>Повторная — раз в 5 лет, срок посчитаем автоматически по дате последней.</div>
        <Field label="Дата последней СОУТ">
          <TextInput type="date" value={soutLastAt} onChange={(e) => setSoutLastAt(e.target.value)} />
        </Field>
        {data.sout.nextDueDate && (
          <div style={{ fontSize: 12, color: C.secondary, marginBottom: 10 }}>Следующая: {fmtDate(data.sout.nextDueDate)}</div>
        )}
        <Btn small disabled={savingSout || soutLastAt === (data.sout.lastAt || '')} onClick={saveSout}>
          {savingSout ? 'Сохраняем...' : 'Сохранить'}
        </Btn>
      </Card>
      {byCategory.staff.map((slot) => (
        <SlotCard key={slot.key} slot={slot} onSave={saveSlot} saving={savingKey === slot.key} />
      ))}

      <div style={{ marginTop: 20 }}><ST>Помещение и оборудование</ST></div>
      <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>УФ-бактерицидная лампа ведётся в разделе «Журналы» — отдельная карточка здесь не нужна.</div>
      {byCategory.premises.map((slot) => (
        <SlotCard key={slot.key} slot={slot} onSave={saveSlot} saving={savingKey === slot.key} />
      ))}

      <div style={{ marginTop: 20 }}><ST>Юридические документы</ST></div>
      {documentsSlots.map((slot) => (
        <SlotCard key={slot.key} slot={slot} onSave={saveSlot} saving={savingKey === slot.key} />
      ))}

      <div style={{ marginTop: 20 }}><ST>Налоги и финансы</ST></div>
      <Card>
        <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>
          Укажите один раз — дальше сроки взносов/отчётности посчитаются сами. Даты — общий ориентир, сверьте с бухгалтером/юристом.
        </div>
        <Field label="Налоговый режим">
          <Select value={taxForm.regime} onChange={(e) => setTaxForm({ ...taxForm, regime: e.target.value })}>
            <option value="">Не указан</option>
            {data.tax.regimes.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </Select>
        </Field>
        <Field label="Дата регистрации ИП (необязательно)">
          <TextInput type="date" value={taxForm.ipRegisteredAt} onChange={(e) => setTaxForm({ ...taxForm, ipRegisteredAt: e.target.value })} />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={taxForm.hasEmployees} onChange={(e) => setTaxForm({ ...taxForm, hasEmployees: e.target.checked })} />
          <span style={{ fontSize: 14 }}>Есть наёмные сотрудники</span>
        </label>
        <Btn small disabled={savingTax} onClick={saveTax}>{savingTax ? 'Сохраняем...' : 'Сохранить'}</Btn>
      </Card>

      {taxDeadlines.length > 0 && (
        <Card>
          <div style={{ fontSize: 12, color: C.subtle, marginBottom: 8 }}>Появившиеся налоговые сроки:</div>
          {taxDeadlines.map((d, i) => (
            <div key={d.id} style={{ padding: '7px 0', borderBottom: i < taxDeadlines.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{d.title}</div>
              <div style={{ fontSize: 12, color: C.subtle }}>{fmtDate(d.due_date)}</div>
            </div>
          ))}
        </Card>
      )}

      <div style={{ marginTop: 20 }}><ST>Журналы</ST></div>
      <div style={{ fontSize: 12, color: C.subtle }}>Сроки допечатки журналов появятся здесь после того, как журнал будет создан в разделе «Журналы».</div>
    </div>
  );
}
