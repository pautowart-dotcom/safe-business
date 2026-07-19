import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/client.js';
import { AuthShell } from './Login.jsx';
import { Btn, Field, TextInput, C } from '../ui/components.jsx';

export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, acceptInvite } = useAuth();

  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get(`/auth/invite/${token}`)
      .then((res) => {
        setInvite(res.data);
        setEmail(res.data.invitedEmail || '');
      })
      .catch((err) => setLoadError(err.response?.data?.error || 'Приглашение не найдено'));
  }, [token]);

  async function handleJoinAsCurrentUser() {
    setError('');
    setSubmitting(true);
    try {
      await acceptInvite({ token });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось принять приглашение');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!acceptedTerms) return;
    setError('');
    setSubmitting(true);
    try {
      await acceptInvite({ token, name, email, password, acceptedTerms, analyticsConsent });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось принять приглашение');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <AuthShell>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Ссылка недействительна</div>
        <div style={{ fontSize: 14, color: C.subtle, lineHeight: 1.5 }}>{loadError}</div>
      </AuthShell>
    );
  }

  if (!invite) {
    return (
      <AuthShell>
        <div style={{ fontSize: 14, color: C.subtle }}>Загрузка...</div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Приглашение в «{invite.companyName}»</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 24 }}>
        Роль: {invite.role === 'owner' ? 'Владелец' : 'Мастер'}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {user && (
        <div style={{ marginBottom: 20 }}>
          <Btn onClick={handleJoinAsCurrentUser} disabled={submitting}>
            {submitting ? 'Присоединяемся...' : `Присоединиться как ${user.name}`}
          </Btn>
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 10, textAlign: 'center' }}>
            или заполните форму ниже, чтобы создать отдельный аккаунт
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Field label="Имя">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Email">
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Пароль">
          <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </Field>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, fontSize: 12, color: C.secondary, lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} style={{ marginTop: 2 }} required />
          <span>
            Я принимаю условия{' '}
            <a href="/legal/oferta" target="_blank" rel="noreferrer" style={{ color: C.primary }}>оферты</a>
            {' '}и{' '}
            <a href="/legal/privacy_policy" target="_blank" rel="noreferrer" style={{ color: C.primary }}>политики конфиденциальности</a>
          </span>
        </label>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 20, fontSize: 12, color: C.subtle, lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={analyticsConsent} onChange={(e) => setAnalyticsConsent(e.target.checked)} style={{ marginTop: 2 }} />
          <span>Согласен на использование обезличенных агрегированных данных для аналитики (необязательно, можно отозвать позже в настройках)</span>
        </label>

        <Btn type="submit" disabled={submitting || !acceptedTerms}>
          {submitting ? 'Создаём аккаунт...' : 'Присоединиться'}
        </Btn>
      </form>
    </AuthShell>
  );
}
