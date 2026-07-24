import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client.js';
import { AuthShell } from './Login.jsx';
import { Btn, Field, TextInput, C } from '../ui/components.jsx';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сменить пароль');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <AuthShell>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Пароль изменён</div>
        <div style={{ fontSize: 14, color: C.subtle }}>Переходим ко входу...</div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Новый пароль</div>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <Field label="Новый пароль">
          <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </Field>
        <Btn type="submit" disabled={submitting}>{submitting ? 'Сохраняем...' : 'Сохранить пароль'}</Btn>
      </form>
    </AuthShell>
  );
}
