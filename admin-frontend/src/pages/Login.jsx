import { useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Btn, Field, TextInput, C, F } from '../ui/components.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(emailRef.current.value, passwordRef.current.value);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось войти');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.surface, fontFamily: F }}>
      <div style={{ width: '100%', maxWidth: 360, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.subtle, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>Безопасный бизнес</div>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>Кабинет платформы</div>
        <form onSubmit={submit}>
          {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}
          <Field label="Email">
            <TextInput ref={emailRef} type="email" required />
          </Field>
          <Field label="Пароль">
            <TextInput ref={passwordRef} type="password" required />
          </Field>
          <Btn type="submit" disabled={submitting} style={{ width: '100%' }}>{submitting ? 'Входим...' : 'Войти'}</Btn>
        </form>
      </div>
    </div>
  );
}
