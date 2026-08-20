import { useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Card, Btn, TextInput, TextArea, Field, C, F } from '../ui/components.jsx';

// Публичная форма приёма заявок (20.08.2026) — НЕ обёрнута в PrivateRoute/
// Layout, свой изолированный axios-инстанс (тот же приём, что в
// AnonymousAudit.jsx) — не трогает localStorage.getItem('token') общего
// приложения, чтобы случайно не задеть уже залогиненную сессию в этом же
// браузере (и чтобы не словить редирект на /login от общего интерцептора
// api/client.js — тут его вообще нет). Клиентский тип (физ/юр) сознательно
// не спрашиваем на публичной форме — лишнее трение для человека, который
// просто оставляет контакт; уточняется потом внутри, при обработке заявки.
const publicApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 20000 });

export default function PublicLeadForm() {
  const { token } = useParams();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!name.trim()) {
      setError('Укажите, пожалуйста, имя');
      return;
    }
    setSending(true);
    setError('');
    try {
      await publicApi.post(`/platform/leads-public/${token}`, { name, phone, comment });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отправить — попробуйте ещё раз');
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, padding: 20, fontFamily: F }}>
      <Card style={{ maxWidth: 420, width: '100%' }}>
        {sent ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Спасибо!</div>
            <p style={{ color: C.secondary }}>Заявка отправлена, с вами свяжутся в ближайшее время.</p>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Оставить заявку</div>
            <p style={{ fontSize: 13, color: C.subtle, marginBottom: 16 }}>Оставьте контакты — свяжемся, чтобы обсудить детали.</p>
            {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}
            <Field label="Имя">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к вам обращаться" />
            </Field>
            <Field label="Телефон">
              <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 900 123-45-67" />
            </Field>
            <Field label="Комментарий">
              <TextArea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Что нужно сделать, адрес, удобное время..." />
            </Field>
            <Btn onClick={submit} disabled={sending} style={{ width: '100%' }}>{sending ? 'Отправляю...' : 'Отправить заявку'}</Btn>
          </>
        )}
      </Card>
    </div>
  );
}
