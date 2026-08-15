import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, BackBtn, Field, TextInput, Select, Btn, Badge, C } from '../ui/components.jsx';
import { NICHE_LABELS } from '../utils/niches.js';

const EMPTY_FORM = {
  name: '', niche: '', durationMinutes: '', approxPrice: '',
  payoutType: '', payoutPercent: '', payoutFixedAmount: '', active: true,
};

function money(v) {
  return `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
}

// Управление каталогом услуг (15.08.2026) — раньше (Этап 2 плана аналитики)
// услуги можно было только быстро добавить прямо из формы визита, без
// экрана редактирования; переопределение оплаты мастеру на услуге (Этап
// "модели оплаты") сделало такой экран необходимым — быстрое добавление
// не место для настройки чужой зарплаты. owner/admin-only (PrivateRoute
// managementOnly в App.jsx) — та же граница, что у Команды.
export default function Services() {
  const [services, setServices] = useState([]);
  const [companyNiches, setCompanyNiches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    return api.get('/modules/visits/services', { params: { includeInactive: 1 } }).then((res) => setServices(res.data)).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    api.get('/platform/companies/current').then((res) => setCompanyNiches(res.data.niches || []));
  }, []);
  usePullToRefresh(load);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError('');
    setShowForm(true);
  }

  function openEdit(s) {
    setForm({
      name: s.name,
      niche: s.niche || '',
      durationMinutes: String(s.duration_minutes),
      approxPrice: s.approx_price != null ? String(s.approx_price) : '',
      payoutType: s.payout_type || '',
      payoutPercent: s.payout_percent != null ? String(s.payout_percent) : '',
      payoutFixedAmount: s.payout_fixed_amount != null ? String(s.payout_fixed_amount) : '',
      active: s.active,
    });
    setEditingId(s.id);
    setError('');
    setShowForm(true);
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.durationMinutes) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        niche: form.niche || null,
        durationMinutes: Number(form.durationMinutes),
        approxPrice: form.approxPrice || null,
        payoutType: form.payoutType || null,
        payoutPercent: form.payoutType === 'percent' ? form.payoutPercent || null : null,
        payoutFixedAmount: form.payoutType === 'fixed' ? form.payoutFixedAmount || null : null,
      };
      if (editingId) {
        await api.patch(`/modules/visits/services/${editingId}`, { ...payload, active: form.active });
      } else {
        await api.post('/modules/visits/services', payload);
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить услугу');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s) {
    await api.patch(`/modules/visits/services/${s.id}`, { active: !s.active });
    load();
  }

  if (loading) return <div className="page-loading">Загрузка...</div>;

  if (showForm) {
    return (
      <div>
        <BackBtn onClick={() => setShowForm(false)} />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>{editingId ? 'Изменить услугу' : 'Новая услуга'}</div>
        <Field label="Название"><TextInput autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например: маникюр классический" /></Field>
        {companyNiches.length > 1 && (
          <Field label="Ниша">
            <Select value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })}>
              <option value="">Любая (без привязки)</option>
              {companyNiches.map((n) => <option key={n} value={n}>{NICHE_LABELS[n] || n}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Длительность, мин"><TextInput type="number" min="1" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} placeholder="40" /></Field>
        <Field label="Ориентировочная цена, ₽ (необязательно)">
          <TextInput type="number" min="0" value={form.approxPrice} onChange={(e) => setForm({ ...form, approxPrice: e.target.value })} placeholder="1500" />
        </Field>

        <Field label="Оплата мастеру на этой услуге">
          <Select value={form.payoutType} onChange={(e) => setForm({ ...form, payoutType: e.target.value })}>
            <option value="">Как у мастера по умолчанию</option>
            <option value="percent">Свой % от чека</option>
            <option value="fixed">Своя фиксированная сумма</option>
          </Select>
        </Field>
        {form.payoutType === 'percent' && (
          <Field label="% от чека на этой услуге">
            <TextInput type="number" min="0" max="100" value={form.payoutPercent} onChange={(e) => setForm({ ...form, payoutPercent: e.target.value })} placeholder="40" />
          </Field>
        )}
        {form.payoutType === 'fixed' && (
          <Field label="Фиксированная сумма мастеру за эту услугу, ₽">
            <TextInput type="number" min="0" value={form.payoutFixedAmount} onChange={(e) => setForm({ ...form, payoutFixedAmount: e.target.value })} placeholder="800" />
          </Field>
        )}
        <div style={{ fontSize: 12, color: C.subtle, marginTop: -8, marginBottom: 14 }}>
          Переопределяет базовую ставку мастера только для этой услуги — например, массаж часто
          платится фиксированной суммой, даже если остальные услуги у мастера идут в процент.
          Если оставить «как у мастера по умолчанию» — берётся ставка, заданная в Команде.
        </div>

        {editingId && (
          <Field label="Статус">
            <Select value={form.active ? '1' : '0'} onChange={(e) => setForm({ ...form, active: e.target.value === '1' })}>
              <option value="1">Активна (видна в форме визита)</option>
              <option value="0">В архиве (скрыта, история визитов не теряется)</option>
            </Select>
          </Field>
        )}

        {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}
        <Btn onClick={handleSubmit} disabled={saving}>{saving ? 'Секунду…' : editingId ? 'Сохранить' : 'Добавить'}</Btn>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Каталог услуг</div>
        <Btn small onClick={openCreate}>+ Добавить</Btn>
      </div>
      {services.length === 0 ? (
        <div className="empty-hint">
          Пока нет ни одной услуги в каталоге — можно добавить здесь или прямо из формы визита.
        </div>
      ) : (
        <Card style={{ padding: 0 }}>
          {services.map((s, i) => (
            <div
              key={s.id}
              onClick={() => openEdit(s)}
              style={{ padding: '14px 16px', borderBottom: i < services.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', opacity: s.active ? 1 : 0.5 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {s.name}
                    {!s.active && <span style={{ marginLeft: 8 }}><Badge color={C.subtle} bg={C.surface}>Архив</Badge></span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>
                    {s.niche ? `${NICHE_LABELS[s.niche] || s.niche} · ` : ''}{s.duration_minutes} мин
                    {s.approx_price != null && ` · ~${money(s.approx_price)}`}
                    {s.payout_type === 'percent' && ` · мастеру ${s.payout_percent}%`}
                    {s.payout_type === 'fixed' && ` · мастеру фикс ${money(s.payout_fixed_amount)}`}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleActive(s); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 12 }}
                >
                  {s.active ? 'В архив' : 'Вернуть'}
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
