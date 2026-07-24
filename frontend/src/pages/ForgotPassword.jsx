import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { AuthShell } from './Login.jsx';
import { Btn, Field, TextInput, C } from '../ui/components.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отправить запрос');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthShell>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Запрос отправлен</div>
        <div style={{ fontSize: 14, color: C.subtle, lineHeight: 1.5, marginBottom: 20 }}>
          Если такой email зарегистрирован — свяжитесь с администратором сервиса, он передаст ссылку для смены пароля.
        </div>
        <Link to="/login" style={{ color: C.primary, fontSize: 14, textDecoration: 'none', fontWeight: 600 }}>← Назад ко входу</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Восстановление пароля</div>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <Field label="Email">
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Btn type="submit" disabled={submitting}>{submitting ? 'Отправляем...' : 'Восстановить пароль'}</Btn>
        <Link to="/login" style={{ display: 'block', textAlign: 'center', marginTop: 14, color: C.subtle, fontSize: 13, textDecoration: 'none' }}>← Назад ко входу</Link>
      </form>
    </AuthShell>
  );
}
