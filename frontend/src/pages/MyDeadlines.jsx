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

const LEGAL_FORM_OPTIONS = [
  { value: '', label: 'Не указана' },
  { value: 'self_employed', label: 'Самозанятый (НПД)' },
  { value: 'ip', label: 'ИП' },
  { value: 'ooo', label: 'ООО' },
];

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
function SlotCard({ slot, onSave, saving, aiDateDetectionAvailable }) {
  const [dueDate, setDueDate] = useState(slot.dueDate || '');
  const [recurrence, setRecurrence] = useState(slot.recurrence || '');
  const [note, setNote] = useState(slot.note || '');
  const [file, setFile] = useState(null);
  // Автоизвлечение даты (30.08.2026, .claude/plans/document-date-extraction.md)
  // — только предлагает значение в поле "Дата", ничего не сохраняет само;
  // пользователь по-прежнему нажимает "Сохранить" отдельно, как раньше.
  const [detecting, setDetecting] = useState(false);
  const [detectNote, setDetectNote] = useState('');

  async function detectDate() {
    if (!file) return;
    setDetecting(true);
    setDetectNote('');
    try {
      const body = new FormData();
      body.append('file', file);
      const { data } = await api.post(`/platform/my-deadlines/slots/${slot.key}/detect-date`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data.found) {
        setDueDate(data.date);
        setDetectNote(`Похоже, это ${fmtDate(data.date)} — проверьте и нажмите «Сохранить».`);
      } else {
        setDetectNote(data.reason || 'Не удалось распознать дату — впишите вручную.');
      }
    } catch (err) {
      setDetectNote(err.response?.data?.error || 'Не удалось распознать дату — впишите вручную.');
    } finally {
      setDetecting(false);
    }
  }

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
        <input type="file" accept="image/*,application/pdf" onChange={(e) => { setFile(e.target.files?.[0] || null); setDetectNote(''); }} />
      </Field>
      {aiDateDetectionAvailable && file && (
        <div style={{ marginTop: -6, marginBottom: 14 }}>
          <button
            type="button"
            onClick={detectDate}
            disabled={detecting}
            style={{ background: 'none', border: 'none', color: C.primary, fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 12.5 }}
          >
            {detecting ? 'Читаем документ…' : 'Распознать дату из документа'}
          </button>
          {detectNote && <div style={{ fontSize: 12, color: C.subtle, marginTop: 4 }}>{detectNote}</div>}
        </div>
      )}
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
  const [taxForm, setTaxForm] = useState({ regime: '', ipRegisteredAt: '', hasEmployees: false, legalForm: '', regionCode: '' });
  const [savingTax, setSavingTax] = useState(false);
  const [regions, setRegions] = useState([]);
  const [patentForm, setPatentForm] = useState({ startAt: '', amount: '' });
  const [savingPatent, setSavingPatent] = useState(false);
  const [recommendation, setRecommendation] = useState(null);
  const [switchingRegime, setSwitchingRegime] = useState(null);
  const [patentSwitchDate, setPatentSwitchDate] = useState('');
  const [switchMessage, setSwitchMessage] = useState('');

  function load() {
    return api.get('/platform/my-deadlines').then((res) => {
      setData(res.data);
      setSoutLastAt(res.data.sout.lastAt || '');
      setTaxForm({
        regime: res.data.tax.regime || '',
        ipRegisteredAt: res.data.tax.ipRegisteredAt || '',
        hasEmployees: !!res.data.tax.hasEmployees,
        legalForm: res.data.legalForm || '',
        regionCode: res.data.regionCode || '',
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
    api.get('/platform/companies/regions').then((res) => setRegions(res.data));
    api.get('/platform/my-deadlines/tax-regime-recommendation').then((res) => setRecommendation(res.data)).catch(() => {});
  }, []);

  async function createSwitchDeadline(targetRegime, startAt) {
    setSwitchingRegime(targetRegime);
    setSwitchMessage('');
    try {
      await api.post('/platform/my-deadlines/tax-regime-recommendation/switch-deadline', { targetRegime, startAt });
      setSwitchMessage('Дедлайн добавлен — смотрите в «Дедлайнах».');
      const res = await api.get('/platform/deadlines', { params: { category: 'tax' } });
      setTaxDeadlines(res.data);
    } catch (err) {
      setSwitchMessage(err.response?.data?.error || 'Не получилось создать дедлайн');
    } finally {
      setSwitchingRegime(null);
    }
  }
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
        legalForm: taxForm.legalForm || '',
        regionCode: taxForm.regionCode || '',
      });
      setTaxForm({
        regime: company.tax_regime || '',
        ipRegisteredAt: company.ip_registered_at || '',
        hasEmployees: !!company.has_employees,
        legalForm: company.legal_form || '',
        regionCode: company.region_code || '',
      });
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
        <SlotCard key={slot.key} slot={slot} onSave={saveSlot} saving={savingKey === slot.key} aiDateDetectionAvailable={data.aiDateDetectionAvailable} />
      ))}

      <div style={{ marginTop: 20 }}><ST>Помещение и оборудование</ST></div>
      {byCategory.premises.map((slot) => (
        <SlotCard key={slot.key} slot={slot} onSave={saveSlot} saving={savingKey === slot.key} aiDateDetectionAvailable={data.aiDateDetectionAvailable} />
      ))}

      <div style={{ marginTop: 20 }}><ST>Юридические документы</ST></div>
      {documentsSlots.map((slot) => (
        <SlotCard key={slot.key} slot={slot} onSave={saveSlot} saving={savingKey === slot.key} aiDateDetectionAvailable={data.aiDateDetectionAvailable} />
      ))}

      <div style={{ marginTop: 20 }}><ST>Налоги и финансы</ST></div>
      <Card>
        <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>
          Укажите один раз — дальше сроки взносов/отчётности посчитаются сами. Даты — общий ориентир, сверьте с бухгалтером/юристом.
        </div>
        <Field label="Форма бизнеса">
          <Select value={taxForm.legalForm} onChange={(e) => setTaxForm({ ...taxForm, legalForm: e.target.value })}>
            {LEGAL_FORM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="Регион регистрации (необязательно)">
          <Select value={taxForm.regionCode} onChange={(e) => setTaxForm({ ...taxForm, regionCode: e.target.value })}>
            <option value="">Не указан</option>
            {regions.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </Select>
        </Field>
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

      {recommendation && (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Что выгоднее (по факту с начала {recommendation.year} года)</div>
          <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>
            Выручка: {fmtMoney(recommendation.revenue)}, расходы: {fmtMoney(recommendation.expenses)}, страховые взносы ИП: {fmtMoney(recommendation.insuranceContribution)}.
            Это не прогноз на весь год, а сравнение вариантов по уже реальным цифрам — сверьте с бухгалтером перед решением.
          </div>
          {switchMessage && <div style={{ fontSize: 12, color: C.primary, marginBottom: 10 }}>{switchMessage}</div>}
          {recommendation.options.map((o) => (
            <div key={o.regime} style={{ padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: o.regime === recommendation.cheapestRegime ? 800 : 600 }}>
                  {o.label}{o.regime === recommendation.cheapestRegime ? ' — выгоднее всего' : ''}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.primary, whiteSpace: 'nowrap' }}>
                  {o.estimatedTaxRub != null ? `~${fmtMoney(o.estimatedTaxRub)}` : '—'}
                </div>
              </div>
              {o.note && <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>{o.note}</div>}
              {(o.regime === 'usn_income' || o.regime === 'usn_income_expense') && (
                <button
                  type="button"
                  disabled={switchingRegime === o.regime}
                  onClick={() => createSwitchDeadline(o.regime)}
                  style={{ marginTop: 6, padding: '4px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.secondary, fontSize: 12, cursor: 'pointer' }}
                >
                  {switchingRegime === o.regime ? 'Создаём...' : 'Дедлайн перехода (до 31 декабря)'}
                </button>
              )}
              {o.regime === 'patent' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <TextInput type="date" value={patentSwitchDate} onChange={(e) => setPatentSwitchDate(e.target.value)} style={{ width: 160 }} />
                  <button
                    type="button"
                    disabled={!patentSwitchDate || switchingRegime === 'patent'}
                    onClick={() => createSwitchDeadline('patent', patentSwitchDate)}
                    style={{ padding: '4px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.secondary, fontSize: 12, cursor: 'pointer' }}
                  >
                    {switchingRegime === 'patent' ? 'Создаём...' : 'Дедлайн заявления (за 10 раб. дней до старта)'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

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
          {data.tax.patentRateSuggestion && !patentForm.amount && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -6, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: C.subtle }}>
                Нашли ставку для вашего региона: {fmtMoney(data.tax.patentRateSuggestion.amount)}
                {!data.tax.patentRateSuggestion.reviewed && ' (не проверено юристом, сверьте перед подачей)'}
              </span>
              <button
                type="button"
                onClick={() => setPatentForm({ ...patentForm, amount: String(data.tax.patentRateSuggestion.amount) })}
                style={{ padding: '4px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.secondary, fontSize: 12, cursor: 'pointer' }}
              >
                Подставить
              </button>
            </div>
          )}
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
