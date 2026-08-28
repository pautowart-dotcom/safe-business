import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, Field, TextInput, Btn, C, F } from '../ui/components.jsx';

// Ставки регионального патента (ПСН) — Фаза 2 движка бизнес-статуса
// (28.08.2026). Заполняется РЕАКТИВНО: строка добавляется, когда для
// конкретного региона+ниши+года реально понадобилась ставка у платящей
// компании — не заранее на все 89 регионов (решение владельца). Одна форма
// "добавить строку", без CSV-импорта — при таком темпе заполнения он не
// нужен, а понадобится, когда/если данных станет действительно много.
const selectStyle = {
  width: '100%', boxSizing: 'border-box', background: C.surface, border: `1.5px solid ${C.border}`,
  borderRadius: 10, padding: '11px 13px', fontSize: 14, color: C.primary, outline: 'none', fontFamily: F,
};

function money(v) {
  return `${Number(v).toLocaleString('ru-RU')} ₽`;
}

const EMPTY_FORM = { regionCode: '', niche: '', okvedCode: '', year: new Date().getFullYear(), employeeTier: '', areaTier: '', amount: '', lawReference: '', sourceUrl: '' };

export default function PatentRates() {
  const [rows, setRows] = useState(null);
  const [regions, setRegions] = useState([]);
  const [niches, setNiches] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function load() {
    api.get('/platform/admin/patent-rates').then((res) => setRows(res.data));
  }

  useEffect(() => {
    load();
    api.get('/platform/companies/regions').then((res) => setRegions(res.data));
    api.get('/platform/admin/niches').then((res) => setNiches(res.data));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/platform/admin/patent-rates', form);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  async function markReviewed(id) {
    await api.patch(`/platform/admin/patent-rates/${id}`, { reviewed: true });
    load();
  }

  async function remove(id) {
    if (!window.confirm('Удалить эту строку?')) return;
    await api.delete(`/platform/admin/patent-rates/${id}`);
    load();
  }

  const nicheLabel = (key) => niches.find((n) => n.key === key)?.label || key;

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Ставки регионального патента</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 20 }}>
        Заполняется по факту — добавляйте строку, когда ставка реально понадобилась для клиента из конкретного региона. Ставки меняются ежегодно, сверяйте перед подтверждением.
      </div>

      <Card>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Добавить ставку</div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          <Field label="Регион">
            <select style={selectStyle} value={form.regionCode} onChange={(e) => setForm({ ...form, regionCode: e.target.value })} required>
              <option value="">Выберите регион</option>
              {regions.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Ниша">
            <select style={selectStyle} value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} required>
              <option value="">Выберите нишу</option>
              {niches.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
            </select>
          </Field>
          <Field label="Год">
            <TextInput type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} required />
          </Field>
          <Field label="Сумма патента за год, ₽">
            <TextInput type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </Field>
          <Field label="Код ОКВЭД (необязательно, для прослеживаемости)">
            <TextInput value={form.okvedCode} onChange={(e) => setForm({ ...form, okvedCode: e.target.value })} placeholder="Например, 96.02" />
          </Field>
          <Field label="Тариф по числу сотрудников (необязательно, если в регионе есть градация)">
            <TextInput value={form.employeeTier} onChange={(e) => setForm({ ...form, employeeTier: e.target.value })} placeholder="Например, до 5 человек" />
          </Field>
          <Field label="Тариф по площади (необязательно, если в регионе есть градация)">
            <TextInput value={form.areaTier} onChange={(e) => setForm({ ...form, areaTier: e.target.value })} placeholder="Например, до 50 м²" />
          </Field>
          <Field label="Норма закона">
            <TextInput value={form.lawReference} onChange={(e) => setForm({ ...form, lawReference: e.target.value })} placeholder="Например, Закон Московской области №..." />
          </Field>
          <Field label="Ссылка на источник">
            <TextInput value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https://" />
          </Field>
          <Btn type="submit" small disabled={saving}>{saving ? 'Сохраняем...' : 'Добавить'}</Btn>
        </form>
      </Card>

      <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, margin: '20px 0 10px' }}>
        {rows ? `${rows.length} ставок в базе` : 'Загрузка...'}
      </div>

      {rows?.map((row) => (
        <Card key={row.id} style={{ borderLeft: `3px solid ${row.status === 'reviewed' ? C.green : C.orange}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{row.regionName} — {nicheLabel(row.niche)} ({row.year})</div>
              <div style={{ fontSize: 13, color: C.secondary, marginTop: 2 }}>
                {money(row.amount)}
                {(row.employeeTier || row.areaTier) && ` · ${[row.employeeTier, row.areaTier].filter(Boolean).join(', ')}`}
              </div>
              {row.lawReference && <div style={{ fontSize: 12, color: C.subtle, marginTop: 4 }}>{row.lawReference}</div>}
              {row.sourceUrl && (
                <a href={row.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.primary }}>Источник</a>
              )}
              <div style={{ fontSize: 11, fontWeight: 700, color: row.status === 'reviewed' ? C.green : C.orange, marginTop: 6 }}>
                {row.status === 'reviewed' ? `Проверено (${row.reviewedBy}, ${row.reviewedAt})` : 'Не проверено — черновик'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {row.status !== 'reviewed' && (
                <Btn small variant="secondary" onClick={() => markReviewed(row.id)}>Проверено</Btn>
              )}
              <Btn small variant="secondary" onClick={() => remove(row.id)}>Удалить</Btn>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
