import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, ST, Field, TextInput, Select, Btn, C } from '../ui/components.jsx';
import { localDateStr } from '../utils/localDate.js';

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

function fmtMoney(v) {
  return `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
}

// Баг №8: у "Договор аренды — дата окончания" не было способа быстро
// прикинуть дату по стандартному сроку — 11 месяцев самый частый вариант
// в РФ (договор на 12+ месяцев подлежит обязательной регистрации, поэтому
// студии почти всегда заключают именно на 11). Считаем от сегодня — это
// приближение для тех, кто ещё не подписал договор и планирует срок,
// а не точная дата уже подписанного (её всё равно вводят вручную датой).
function addMonthsFromToday(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return localDateStr(d);
}
const LEASE_TERM_PRESETS = [
  ['11 месяцев', 11],
  ['1 год', 12],
  ['3 года', 36],
];

// Карточка одного пункта — дата/периодичность/заметка, все поля опциональны.
// Сохраняем только по клику "Сохранить", чтобы не слать запрос на каждое
// нажатие клавиши в заметке.
function SlotCard({ slot, onSave, saving }) {
  const [dueDate, setDueDate] = useState(slot.dueDate || '');
  const [recurrence, setRecurrence] = useState(slot.recurrence || '');
  const [note, setNote] = useState(slot.note || '');
  const [file, setFile] = useState(null);

  const dirty = dueDate !== (slot.dueDate || '') || recurrence !== (slot.recurrence || '') || note !== (slot.note || '') || !!file;

  return (
    <Card>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{slot.label}</div>
      <Field label="Дата">
        <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>
      {slot.key === 'lease_end' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: -6, marginBottom: 14 }}>
          {LEASE_TERM_PRESETS.map(([label, months]) => (
            <button
              key={months}
              type="button"
              onClick={() => setDueDate(addMonthsFromToday(months))}
              style={{
                padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface,
                color: C.secondary, fontSize: 12, cursor: 'pointer',
              }}
            >
              +{label} от сегодня
            </button>
          ))}
        </div>
      )}
      {/* Аренда — это пересматриваемый срок договора (для этого уже есть
          пресеты +11 мес/+1 год/+3 года выше), а не автоматически
          повторяющаяся проверка вроде "раз в квартал" — показывать оба
          выбора рядом для одного поля было избыточно и запутывало. */}
      {slot.key !== 'lease_end' && (
        <Field label="Периодичность (необязательно)">
          <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
            {RECURRENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Заметка / контакт подрядчика (необязательно)">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например, телефон обслуживающей организации" />
      </Field>
      <Field label="Файл-подтверждение (фото, скан или PDF, необязательно)">
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </Field>
      {slot.fileUrl && !file && (
        <a href={slot.fileUrl} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 12, color: C.primary, marginTop: -6, marginBottom: 14 }}>
          Открыть прикреплённый файл
        </a>
      )}
      <Btn small disabled={!dirty || saving} onClick={() => onSave(slot.key, { dueDate: dueDate || null, recurrence: recurrence || null, note: note || null, file })}>
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
  const [patentForm, setPatentForm] = useState({ startAt: '', amount: '' });
  const [savingPatent, setSavingPatent] = useState(false);

  function load() {
    return api.get('/platform/my-deadlines').then((res) => {
      setData(res.data);
      setSoutLastAt(res.data.sout.lastAt || '');
      setTaxForm({
        regime: res.data.tax.regime || '',
        ipRegisteredAt: res.data.tax.ipRegisteredAt || '',
        hasEmployees: !!res.data.tax.hasEmployees,
      });
      setPatentForm({
        startAt: res.data.tax.patentStartAt || '',
        amount: res.data.tax.patentAmount != null ? String(res.data.tax.patentAmount) : '',
      });
    });
  }

  useEffect(() => {
    load();
    api.get('/platform/deadlines', { params: { category: 'tax' } }).then((res) => setTaxDeadlines(res.data));
  }, []);
  usePullToRefresh(load);

  async function saveSlot(key, { file, ...fields }) {
    setSavingKey(key);
    setError('');
    try {
      let body = fields;
      let headers = {};
      if (file) {
        body = new FormData();
        for (const [k, v] of Object.entries(fields)) if (v !== null) body.append(k, v);
        body.append('file', file);
        headers = { 'Content-Type': 'multipart/form-data' };
      }
      await api.patch(`/platform/my-deadlines/slots/${key}`, body, { headers });
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

  async function savePatent() {
    setSavingPatent(true);
    setError('');
    try {
      await api.patch('/platform/my-deadlines/patent', {
        startAt: patentForm.startAt || null,
        amount: patentForm.amount === '' ? null : patentForm.amount,
      });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSavingPatent(false);
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

      {taxForm.regime === 'patent' && (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Патент</div>
          <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>
            Точную стоимость патента мы не считаем — она зависит от региона, ниши и года.{' '}
            <a href="https://patent.nalog.ru/info/" target="_blank" rel="noreferrer">Посчитать на сайте ФНС</a>.
            Введите уже известную сумму — посчитаем график оплаты по срокам, которые едины для всех (ст. 346.51 НК РФ).
          </div>
          <Field label="Дата начала действия патента">
            <TextInput type="date" value={patentForm.startAt} onChange={(e) => setPatentForm({ ...patentForm, startAt: e.target.value })} />
          </Field>
          <Field label="Стоимость патента, ₽">
            <TextInput type="number" value={patentForm.amount} onChange={(e) => setPatentForm({ ...patentForm, amount: e.target.value })} />
          </Field>
          <Btn small disabled={savingPatent} onClick={savePatent}>{savingPatent ? 'Сохраняем...' : 'Сохранить'}</Btn>

          {patentForm.startAt && patentForm.amount && !data.tax.patent && (
            <div style={{ fontSize: 12, color: C.subtle, marginTop: 10 }}>
              Чтобы посчитать график оплаты, укажите ещё дату окончания патента ниже, в разделе «Юридические документы».
            </div>
          )}

          {data.tax.patent && (
            <div style={{ marginTop: 10 }}>
              {data.tax.patent.schedule.map((s, i) => (
                <div
                  key={s.label}
                  style={{ padding: '7px 0', borderBottom: i < data.tax.patent.schedule.length - 1 ? `1px solid ${C.border}` : 'none' }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontSize: 12, color: C.subtle }}>{fmtDate(s.dueDate)}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, marginTop: 2 }}>{fmtMoney(s.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {data.tax.reserves?.length > 0 && (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Резерв на налоги</div>
          <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>
            Ориентировочно, по уже внесённой выручке{taxForm.regime === 'usn_income_expense' ? ' и расходам' : ''} с
            начала квартала по сегодня — не итоговая сумма к уплате, без вычета страховых взносов. Сверьте с
            бухгалтером.
          </div>
          {data.tax.reserves.map((r, i) => (
            <div
              key={r.slotKey}
              style={{ padding: '7px 0', borderBottom: i < data.tax.reserves.length - 1 ? `1px solid ${C.border}` : 'none' }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</div>
              <div style={{ fontSize: 12, color: C.subtle }}>{fmtDate(r.dueDate)}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, marginTop: 2 }}>~{fmtMoney(r.amount)}</div>
            </div>
          ))}
        </Card>
      )}

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
    </div>
  );
}
