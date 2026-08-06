import { useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Btn, Field, TextInput, C, F } from '../ui/components.jsx';

function Shell({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.surface, fontFamily: F }}>
      <div style={{ width: '100%', maxWidth: 360, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32 }}>
        {children}
      </div>
    </div>
  );
}

// Код с почты — обязателен для супер-админа с 06.08.2026 (см. AuthContext).
// Тот же паттерн resend, что в клиентском ЛК (frontend/src/pages/Login.jsx):
// "Назад" стирал бы форму входа без объяснения, если письмо задержалось.
function VerifyCodeForm({ email, onVerify, onResend, onBack }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onVerify(email, code);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось подтвердить код');
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    setError('');
    setResent(false);
    setResending(true);
    try {
      await onResend();
      setResent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отправить код повторно');
    } finally {
      setResending(false);
    }
  }

  return (
    <Shell>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.subtle, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>Безопасный бизнес</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Код из письма</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 20, lineHeight: 1.5 }}>
        Отправили код на {email}. Проверьте папку «Спам», если письмо не пришло за пару минут.
      </div>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}
        {resent && !error && <div className="alert alert-success" style={{ marginBottom: 14 }}>Код отправлен повторно</div>}
        <Field label="Код">
          <TextInput autoFocus inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
        </Field>
        <Btn type="submit" disabled={submitting || code.length < 6} style={{ width: '100%' }}>{submitting ? 'Проверяем...' : 'Подтвердить'}</Btn>
        <button
          type="button"
          onClick={resend}
          disabled={resending}
          style={{ width: '100%', background: 'none', border: 'none', cursor: resending ? 'default' : 'pointer', color: resending ? C.subtle : C.primary, fontSize: 13, fontWeight: 600, marginTop: 14, padding: 0 }}
        >
          {resending ? 'Отправляем...' : 'Отправить код ещё раз'}
        </button>
        <button type="button" onClick={onBack} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 13, marginTop: 14, padding: 0 }}>
          Назад
        </button>
      </form>
    </Shell>
  );
}

export default function Login() {
  const { user, login, verifyCode } = useAuth();
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Пароль держим только в памяти рядом с verifyEmail — нужен исключительно
  // для "Отправить код ещё раз" (повторный login(email, password), тот же
  // путь, что и обычный вход). Нигде не сохраняется.
  const [verifyEmail, setVerifyEmail] = useState(null);
  const [verifyPassword, setVerifyPassword] = useState(null);

  if (user) return <Navigate to="/" replace />;

  if (verifyEmail) {
    return (
      <VerifyCodeForm
        email={verifyEmail}
        onVerify={verifyCode}
        onResend={() => login(verifyEmail, verifyPassword)}
        onBack={() => { setVerifyEmail(null); setVerifyPassword(null); }}
      />
    );
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const password = passwordRef.current.value;
      const result = await login(emailRef.current.value, password);
      if (result?.requiresDeviceVerification) {
        setVerifyEmail(result.email);
        setVerifyPassword(password);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось войти');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell>
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
    </Shell>
  );
}
