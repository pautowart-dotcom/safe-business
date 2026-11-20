import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { AuthShell } from './Login.jsx';
import { Btn, Field, TextInput, Select, C } from '../ui/components.jsx';
import { getCaptchaToken } from '../utils/captcha.js';

const STATUSES = [
  ['self_employed', 'Самозанятый'],
  ['ip', 'ИП'],
  ['ooo', 'Организация'],
];

export default function PartnerJoin() {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '', legalStatus: 'self_employed', legalName: '', inn: '',
  });
  const [offer, setOffer] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const captchaToken = await getCaptchaToken();
      const { data } = await api.post('/platform/partner/register', {
        ...form,
        acceptedOffer: offer,
        acceptedPrivacy: privacy,
        captchaToken,
      });
      setSent(data.email || form.email);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось зарегистрироваться');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthShell>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Код ушёл на почту</div>
        <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.45 }}>
          На {sent} отправлен код. Войдите с этой почтой и введите его — после этого откроется кабинет партнёра.
        </p>
        <Link to="/login" style={{ color: C.primary, fontWeight: 700 }}>Перейти ко входу</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Регистрация партнёра</div>
      <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.45, marginTop: 0 }}>
        Отдельный аккаунт программы. Нужен статус самозанятого, ИП или организации: физическому лицу без этого статуса выплату не делаем.
      </p>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <Field label="Как к вам обращаться"><TextInput value={form.name} onChange={(e) => set('name', e.target.value)} required /></Field>
        <Field label="Имя для выплаты"><TextInput value={form.legalName} onChange={(e) => set('legalName', e.target.value)} placeholder="ФИО или название организации" required /></Field>
        <Field label="Почта"><TextInput type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required /></Field>
        <Field label="Телефон"><TextInput value={form.phone} onChange={(e) => set('phone', e.target.value)} required /></Field>
        <Field label="Пароль"><TextInput type="password" value={form.password} onChange={(e) => set('password', e.target.value)} required minLength={8} /></Field>
        <Field label="Кто вы">
          <Select value={form.legalStatus} onChange={(e) => set('legalStatus', e.target.value)}>
            {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
        <Field label="ИНН">
          <TextInput value={form.inn} onChange={(e) => set('inn', e.target.value)} inputMode="numeric" required />
        </Field>
        <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 10, lineHeight: 1.4 }}>
          <input type="checkbox" checked={offer} onChange={(e) => setOffer(e.target.checked)} />
          <span>Принимаю <a href="/lk/legal/partner_offer" target="_blank" rel="noreferrer">оферту партнёрской программы</a></span>
        </label>
        <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 14, lineHeight: 1.4 }}>
          <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
          <span>Согласен с <a href="/lk/legal/partner_privacy" target="_blank" rel="noreferrer">политикой партнёрской программы</a></span>
        </label>
        <Btn type="submit" disabled={busy || !offer || !privacy}>{busy ? 'Отправляем…' : 'Зарегистрироваться'}</Btn>
      </form>
    </AuthShell>
  );
}
