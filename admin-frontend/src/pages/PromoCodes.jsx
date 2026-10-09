import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { Card, Badge, Btn, Field, TextInput, C } from '../ui/components.jsx';

// Промокоды (09.10.2026) — скидка на первый платёж подписки. Владелец сам
// создаёт коды, задаёт лимит и срок, выключает; видно, сколько компаний
// пробовали и сколько оплатили. Коды не удаляются — только выключаются
// (на них ссылаются платежи).
// По умолчанию — отчёт в гостевом тесте с лендинга: это основной поток
// (владелец, 09.10.2026), подписку через код оформляют реже.
const EMPTY_FORM = { code: '', appliesTo: 'report', discountType: 'percent', discountValue: '', maxRedemptions: '', validUntil: '', note: '', testOnly: false };
const PRICE_RUB = 1990;
const APPLIES_TO_LABELS = { report: 'Отчёт в тесте с сайта', subscription: 'Подписка, первый месяц' };

const STATUS_LABELS = { succeeded: 'оплачено', pending: 'не завершено', canceled: 'отменено' };

function money(v) {
  return `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
}

function discountLabel(c) {
  return c.discountType === 'percent' ? `−${c.discountValue}%` : `−${money(c.discountValue)}`;
}

function firstPaymentPreview(type, value) {
  const v = Number(value);
  if (!v) return null;
  const discount = Math.min(type === 'percent' ? Math.round((PRICE_RUB * v) / 100) : v, PRICE_RUB - 1);
  return PRICE_RUB - discount;
}

export default function PromoCodes() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [payments, setPayments] = useState({});

  function load() {
    return api
      .get('/platform/admin-promo-codes', { silent: true })
      .then(({ data: d }) => setData(d))
      .catch((err) => setError(err.response?.data?.error || 'Не удалось загрузить промокоды'));
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await api.post('/platform/admin-promo-codes', form, { silent: true });
      setForm(null);
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Не удалось создать код');
    } finally {
      setSaving(false);
    }
  }

  async function patch(id, body) {
    try {
      await api.patch(`/platform/admin-promo-codes/${id}`, body, { silent: true });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    }
  }

  function editLimit(c) {
    const v = window.prompt('Сколько раз можно использовать (пусто — без лимита):', c.maxRedemptions ?? '');
    if (v === null) return;
    patch(c.id, { maxRedemptions: v.trim() });
  }
  function editValidUntil(c) {
    const current = c.validUntil ? new Date(c.validUntil).toISOString().slice(0, 10) : '';
    const v = window.prompt('Действует до (ГГГГ-ММ-ДД, пусто — бессрочно):', current);
    if (v === null) return;
    patch(c.id, { validUntil: v.trim() });
  }

  function togglePayments(id) {
    if (openId === id) return setOpenId(null);
    setOpenId(id);
    api.get(`/platform/admin-promo-codes/${id}/payments`).then(({ data: rows }) => setPayments((p) => ({ ...p, [id]: rows })));
  }

  const preview = form ? firstPaymentPreview(form.discountType, form.discountValue) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Промокоды</h1>
        {!form && <Btn small onClick={() => { setForm(EMPTY_FORM); setFormError(''); }}>+ Новый код</Btn>}
      </div>
      <div style={{ fontSize: 13, color: C.subtle }}>
        «Отчёт в тесте с сайта» — скидка на разовый отчёт после бесплатного теста без регистрации, поле перед кнопкой оплаты. «Подписка» — скидка только на первый месяц, дальше {money(PRICE_RUB)}/мес, поле на странице «Подписка».
      </div>
      {data && !data.enabledForAll && (
        <div style={{ background: C.orangeBg, color: C.orange, borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
          Режим обкатки: работают только коды с галкой «Тестовый» (для проверки на себе) и любые коды у компаний с пометкой «Тестовая». Для всех включается на сервере (PROMO_CODES_ENABLED=true) — после ответа юриста по оферте.
        </div>
      )}
      {error && <div style={{ color: C.red }}>{error}</div>}

      {form && (
        <Card>
          <form onSubmit={create}>
            <Field label="Код (буквы, цифры, - или _)">
              <TextInput value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="Например: МАСТЕРА20" />
            </Field>
            <Field label="На что действует">
              <select
                value={form.appliesTo}
                onChange={(e) => setForm({ ...form, appliesTo: e.target.value })}
                style={{ width: '100%', borderRadius: 10, border: `1.5px solid ${C.border}`, padding: '11px 10px', background: C.surface, fontSize: 14 }}
              >
                {Object.entries(APPLIES_TO_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Скидка">
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={form.discountType}
                  onChange={(e) => setForm({ ...form, discountType: e.target.value })}
                  style={{ borderRadius: 10, border: `1.5px solid ${C.border}`, padding: '0 10px', background: C.surface, fontSize: 14 }}
                >
                  <option value="percent">%</option>
                  <option value="fixed">₽</option>
                </select>
                <TextInput type="number" min="1" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} />
              </div>
              {preview != null && (
                <div style={{ fontSize: 12, color: C.subtle, marginTop: 6 }}>
                  {form.appliesTo === 'report' ? 'Отчёт' : 'Первый месяц'}: {money(preview)} вместо {money(PRICE_RUB)}
                </div>
              )}
            </Field>
            <Field label="Сколько раз можно использовать (пусто — без лимита)">
              <TextInput type="number" min="1" value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} />
            </Field>
            <Field label="Действует до (пусто — бессрочно)">
              <TextInput type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
            </Field>
            <Field label="Заметка для себя (где раздавали)">
              <TextInput value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Например: чат мастеров, октябрь" />
            </Field>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: C.secondary, marginBottom: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.testOnly} onChange={(e) => setForm({ ...form, testOnly: e.target.checked })} style={{ marginTop: 2 }} />
              <span>Тестовый — работает уже сейчас, в режиме обкатки. Для проверки на себе, никому не раздавать; лучше с лимитом 1–2.</span>
            </label>
            {formError && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{formError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn small type="submit" disabled={saving}>{saving ? 'Сохраняем...' : 'Создать'}</Btn>
              <Btn small variant="secondary" onClick={() => setForm(null)}>Отмена</Btn>
            </div>
          </form>
        </Card>
      )}

      {data && data.codes.length === 0 && !form && <Card>Кодов пока нет.</Card>}
      {data?.codes.map((c) => {
        const expired = c.validUntil && new Date(c.validUntil) < new Date();
        const exhausted = c.maxRedemptions != null && c.paymentsSucceeded >= c.maxRedemptions;
        return (
          <Card key={c.id} style={{ opacity: c.active ? 1 : 0.6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace' }}>{c.code}</span>
                <Badge color={C.blue} bg={C.blueBg}>{discountLabel(c)}</Badge>
                <Badge color={C.secondary} bg={C.surface}>{APPLIES_TO_LABELS[c.appliesTo] || c.appliesTo}</Badge>
                {c.testOnly && <Badge color={C.purple} bg={C.purpleBg}>тестовый</Badge>}
                {!c.active && <Badge color={C.secondary} bg={C.surface}>выключен</Badge>}
                {c.active && expired && <Badge color={C.orange} bg={C.orangeBg}>срок вышел</Badge>}
                {c.active && exhausted && <Badge color={C.orange} bg={C.orangeBg}>лимит исчерпан</Badge>}
              </div>
              <Btn small variant={c.active ? 'secondary' : 'primary'} onClick={() => patch(c.id, { active: !c.active })}>
                {c.active ? 'Выключить' : 'Включить'}
              </Btn>
            </div>
            {c.note && <div style={{ fontSize: 13, color: C.secondary, marginTop: 6 }}>{c.note}</div>}
            <div style={{ fontSize: 13, color: C.secondary, marginTop: 10, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <span>Пробовали: <b>{c.companiesTried}</b></span>
              <span>Оплатили: <b>{c.companiesPaid}</b></span>
              <span>Получено: <b>{money(c.paidRub)}</b></span>
              <span>Скидок дали: <b>{money(c.discountRub)}</b></span>
            </div>
            <div style={{ fontSize: 12, color: C.subtle, marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <button onClick={() => editLimit(c)} style={linkStyle}>
                Лимит: {c.maxRedemptions != null ? `${c.paymentsSucceeded} из ${c.maxRedemptions}` : 'без лимита'} ✎
              </button>
              <button onClick={() => editValidUntil(c)} style={linkStyle}>
                Срок: {c.validUntil ? `до ${new Date(c.validUntil).toLocaleDateString('ru-RU')}` : 'бессрочно'} ✎
              </button>
              {c.companiesTried > 0 && (
                <button onClick={() => togglePayments(c.id)} style={linkStyle}>{openId === c.id ? 'Скрыть оплаты' : 'Кто оплачивал ›'}</button>
              )}
            </div>
            {openId === c.id && (
              <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                {!payments[c.id] && <div style={{ fontSize: 13, color: C.subtle }}>Загрузка...</div>}
                {payments[c.id]?.map((p) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0' }}>
                    <span>
                      <Link to={`/companies/${p.companyId}`} style={{ color: C.primary }}>{p.companyName}</Link>
                      {p.isTest && <span style={{ color: C.purple }}> · тест</span>}
                      <span style={{ color: C.subtle }}> · {new Date(p.createdAt).toLocaleDateString('ru-RU')}</span>
                    </span>
                    <span style={{ color: p.status === 'succeeded' ? C.green : C.subtle }}>
                      {money(p.amountRub)} · {STATUS_LABELS[p.status] || p.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

const linkStyle = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.secondary, fontSize: 12 };
