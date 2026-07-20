import { useEffect, useRef, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, BackBtn, Field, TextInput, Select, Btn, Avatar, Icon, C } from '../ui/components.jsx';

function toLocalInputValue(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function nowLocal() {
  return toLocalInputValue(new Date());
}

const EMPTY_FORM = {
  lastName: '', firstName: '', clientId: null,
  masterMembershipId: '', service: '', materials: '', amount: '', discountPercent: '0',
  visitAt: nowLocal(), photoBeforeUrl: '', photoAfterUrl: '', supplies: [],
};

function money(v) {
  return `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
}

// Ячейка загрузки фото — как в reference/studio_os_mvp.tsx (пунктирная
// рамка → камера → отмеченное состояние), но с реальной загрузкой файла
// на сервер вместо мокового переключателя.
function PhotoUploadCell({ label, url, onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const data = new FormData();
      data.append('photo', file);
      const res = await api.post('/modules/visits/photos', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      onUploaded(res.data.url);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось загрузить фото');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1.5px ${url ? 'solid' : 'dashed'} ${url ? C.green : C.border}`,
          borderRadius: 12, padding: 16, textAlign: 'center', cursor: 'pointer',
          background: url ? C.greenBg : C.surface,
        }}
      >
        {url ? (
          <img src={url} alt={`Фото ${label}`} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }} />
        ) : (
          <Icon name="camera" size={22} color={C.subtle} />
        )}
        <div style={{ fontSize: 12, color: url ? C.green : C.subtle, marginTop: 8, fontWeight: url ? 600 : 400 }}>
          {uploading ? 'Загрузка...' : `Фото ${label}${url ? ' ✓' : ''}`}
        </div>
      </div>
      {error && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export default function Visits() {
  const { isManagement } = useAuth();
  const [visits, setVisits] = useState([]);
  const [masters, setMasters] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [clientMatches, setClientMatches] = useState([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [supplyPick, setSupplyPick] = useState('');
  const [supplyQty, setSupplyQty] = useState('');

  const firstNameRef = useRef(null);
  const serviceRef = useRef(null);
  const materialsRef = useRef(null);
  const priceRef = useRef(null);

  function load() {
    setLoading(true);
    return api.get('/modules/visits').then((res) => setVisits(res.data)).finally(() => setLoading(false));
  }

  useEffect(load, []);
  usePullToRefresh(load);

  useEffect(() => {
    if (!isManagement) return;
    api.get('/platform/memberships').then((res) => {
      setMasters(res.data.filter((m) => m.role === 'master' && m.user_id));
    });
  }, [isManagement]);

  useEffect(() => {
    api.get('/modules/supplies').then((res) => setSupplies(res.data));
  }, []);

  useEffect(() => {
    if (form.clientId || !form.lastName || form.lastName.length < 2) {
      setClientMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      api.get('/modules/clients', { params: { search: form.lastName } }).then((res) => setClientMatches(res.data));
    }, 250);
    return () => clearTimeout(timer);
  }, [form.lastName, form.clientId]);

  function openCreate() {
    setForm({ ...EMPTY_FORM, visitAt: nowLocal(), masterMembershipId: isManagement ? '' : undefined, supplies: [] });
    setEditingId(null);
    setClientMatches([]);
    setSaved(false);
    setError('');
    setSupplyPick('');
    setSupplyQty('');
    setShowForm(true);
  }

  function openEdit(v) {
    setForm({
      lastName: v.client_last_name || '',
      firstName: v.client_first_name || '',
      clientId: v.client_id,
      masterMembershipId: v.master_membership_id || '',
      service: v.service || '',
      materials: v.materials || '',
      amount: String(v.amount ?? ''),
      discountPercent: String(v.discount_percent ?? '0'),
      visitAt: v.visit_at ? toLocalInputValue(v.visit_at) : nowLocal(),
      photoBeforeUrl: v.photo_before_url || '',
      photoAfterUrl: v.photo_after_url || '',
      supplies: (v.supplies || []).map((s) => ({ supplyId: s.supplyId, quantity: String(s.quantity), name: s.name, unit: s.unit })),
    });
    setEditingId(v.id);
    setClientMatches([]);
    setSaved(false);
    setError('');
    setSupplyPick('');
    setSupplyQty('');
    setShowForm(true);
  }

  function addSupplyToForm() {
    if (!supplyPick || !supplyQty || Number(supplyQty) <= 0) return;
    const supply = supplies.find((s) => String(s.id) === String(supplyPick));
    if (!supply) return;
    setForm({
      ...form,
      supplies: [...form.supplies, { supplyId: supply.id, quantity: supplyQty, name: supply.name, unit: supply.unit }],
    });
    setSupplyPick('');
    setSupplyQty('');
  }

  function removeSupplyFromForm(idx) {
    setForm({ ...form, supplies: form.supplies.filter((_, i) => i !== idx) });
  }

  function pickClient(client) {
    setForm({ ...form, clientId: client.id, lastName: client.last_name, firstName: client.first_name });
    setClientMatches([]);
  }

  function clearClient() {
    setForm({ ...form, clientId: null });
  }

  function handleEnter(e, nextRef) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    nextRef?.current?.focus();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    let clientId = form.clientId;
    try {
      if (!clientId) {
        if (!form.lastName || !form.firstName) return;
        const created = await api.post('/modules/clients', { firstName: form.firstName, lastName: form.lastName });
        clientId = created.data.id;
      }

      const payload = {
        clientId,
        service: form.service,
        materials: form.materials || null,
        amount: Number(form.amount),
        discountPercent: Number(form.discountPercent) || 0,
        visitAt: form.visitAt ? new Date(form.visitAt).toISOString() : undefined,
        masterMembershipId: isManagement ? form.masterMembershipId || undefined : undefined,
        photoBeforeUrl: form.photoBeforeUrl || null,
        photoAfterUrl: form.photoAfterUrl || null,
        supplies: form.supplies.map((s) => ({ supplyId: s.supplyId, quantity: Number(s.quantity) })),
      };

      if (editingId) {
        await api.patch(`/modules/visits/${editingId}`, payload);
      } else {
        await api.post('/modules/visits', payload);
      }
      setSaved(true);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить визит');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Удалить визит?')) return;
    await api.delete(`/modules/visits/${id}`);
    load();
  }

  const priceNum = Number(form.amount) || 0;
  const discPct = Number(form.discountPercent) || 0;
  const discRub = Math.round((priceNum * discPct) / 100);
  const finalPrice = priceNum - discRub;
  const suggestedMaster = masters.find((m) => String(m.id) === String(form.masterMembershipId));

  if (showForm) {
    if (saved) {
      return (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Визит сохранён</div>
          <div style={{ fontSize: 14, color: C.subtle, marginBottom: 32 }}>Данные добавлены в историю</div>
          <Btn onClick={() => setShowForm(false)}>Готово</Btn>
        </div>
      );
    }

    return (
      <div>
        <BackBtn onClick={() => setShowForm(false)} />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>{editingId ? 'Изменить визит' : 'Новый визит'}</div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Фамилия">
              <TextInput
                required
                value={form.lastName}
                disabled={!!form.clientId}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                onKeyDown={(e) => handleEnter(e, firstNameRef)}
                placeholder="Иванова"
              />
            </Field>
            <Field label="Имя">
              <TextInput
                required
                ref={firstNameRef}
                value={form.firstName}
                disabled={!!form.clientId}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                onKeyDown={(e) => handleEnter(e, isManagement ? undefined : serviceRef)}
                placeholder="Анна"
              />
            </Field>
          </div>

          {clientMatches.length > 0 && (
            <div style={{ background: C.orangeBg, border: `1px solid ${C.orange}33`, borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: C.orange, fontWeight: 700, marginBottom: 6 }}>⚡ Найден клиент</div>
              {clientMatches.map((c) => (
                <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: C.secondary, flex: 1 }}>{c.last_name} {c.first_name}</span>
                  <Btn small onClick={() => pickClient(c)}>Это он/она</Btn>
                </div>
              ))}
            </div>
          )}
          {form.clientId && (
            <div style={{ fontSize: 12, color: C.subtle, marginTop: -8, marginBottom: 14 }}>
              Клиент выбран. <span style={{ color: C.primary, cursor: 'pointer', fontWeight: 600 }} onClick={clearClient}>Другой человек</span>
            </div>
          )}

          {isManagement && (
            <Field label="Мастер">
              <Select required value={form.masterMembershipId} onChange={(e) => setForm({ ...form, masterMembershipId: e.target.value })}>
                <option value="">Выберите мастера</option>
                {masters.map((m) => <option key={m.id} value={m.id}>{m.user_name}</option>)}
              </Select>
            </Field>
          )}

          <Field label="Услуга">
            <TextInput required ref={serviceRef} value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} onKeyDown={(e) => handleEnter(e, materialsRef)} placeholder="Маникюр + гель-лак" />
          </Field>
          <Field label="Материалы">
            <TextInput ref={materialsRef} value={form.materials} onChange={(e) => setForm({ ...form, materials: e.target.value })} onKeyDown={(e) => handleEnter(e, priceRef)} placeholder="Гель-лак №47, топ..." />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Сумма, ₽">
              <TextInput ref={priceRef} required type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="2500" />
            </Field>
            <Field label="Скидка, %">
              <TextInput type="number" min="0" max="100" value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} />
            </Field>
          </div>

          {priceNum > 0 && (
            <div style={{ background: C.surface, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
              {discPct > 0 && <div style={{ color: C.orange, marginBottom: 4 }}>Скидка {discPct}% = {discRub.toLocaleString('ru-RU')} ₽ · Клиент платит: {finalPrice.toLocaleString('ru-RU')} ₽</div>}
              {suggestedMaster && <div style={{ color: C.green, fontWeight: 600 }}>Заработок мастера ({suggestedMaster.payout_percent}% от {priceNum.toLocaleString('ru-RU')} ₽): {Math.round((priceNum * (suggestedMaster.payout_percent || 0)) / 100).toLocaleString('ru-RU')} ₽</div>}
            </div>
          )}

          <Field label="Фото">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <PhotoUploadCell label="до" url={form.photoBeforeUrl} onUploaded={(url) => setForm({ ...form, photoBeforeUrl: url })} />
              <PhotoUploadCell label="после" url={form.photoAfterUrl} onUploaded={(url) => setForm({ ...form, photoAfterUrl: url })} />
            </div>
          </Field>

          <Field label="Расходники (необязательно)">
            {form.supplies.map((s, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.surface, borderRadius: 10, padding: '8px 12px', marginBottom: 6 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{s.name}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{s.quantity} {s.unit}</span>
                <button type="button" onClick={() => removeSupplyFromForm(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 14 }}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <Select value={supplyPick} onChange={(e) => setSupplyPick(e.target.value)} style={{ flex: 2 }}>
                <option value="">Выберите расходник</option>
                {supplies.map((s) => <option key={s.id} value={s.id}>{s.name}{s.unit ? ` (${s.unit})` : ''}</option>)}
              </Select>
              <TextInput type="number" min="0" step="0.01" placeholder="Кол-во" value={supplyQty} onChange={(e) => setSupplyQty(e.target.value)} style={{ flex: 1 }} />
              <Btn small type="button" onClick={addSupplyToForm}>+</Btn>
            </div>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
            <Field label="Дата и время">
              <TextInput type="datetime-local" value={form.visitAt} onChange={(e) => setForm({ ...form, visitAt: e.target.value })} />
            </Field>
          </div>

          <Btn type="submit">{editingId ? 'Сохранить изменения' : 'Сохранить визит'}</Btn>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Визиты</div>
        <button onClick={openCreate} style={{ background: C.primary, color: '#FFF', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Визит</button>
      </div>

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : (
        <Card style={{ padding: 0 }}>
          {visits.map((v, i) => (
            <div key={v.id} onClick={() => openEdit(v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', borderBottom: i < visits.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar letter={v.client_last_name?.[0]} size={36} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{v.client_last_name} {v.client_first_name}</div>
                  <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>
                    {v.service} {isManagement && v.master_name && `· ${v.master_name.split(' ')[0]} `}· {new Date(v.visit_at).toLocaleString('ru-RU')}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{money(v.final_amount)}</div>
                  {Number(v.discount_percent) > 0 && <div style={{ fontSize: 11, color: C.orange }}>−{v.discount_percent}%</div>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(v.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 14 }}>✕</button>
              </div>
            </div>
          ))}
          {visits.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: C.subtle, fontSize: 14 }}>Визитов не найдено</div>}
        </Card>
      )}
    </div>
  );
}
