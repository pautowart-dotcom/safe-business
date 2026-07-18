import { useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Btn, Field, TextInput, C, F } from '../ui/components.jsx';

export function AuthShell({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', fontFamily: F, background: C.bg }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: C.primary, letterSpacing: '-1px' }}>Безопасный бизнес</div>
        <div style={{ fontSize: 14, color: C.subtle, marginTop: 6 }}>Платформа для студий маникюра</div>
      </div>
      <div style={{ width: '100%', maxWidth: 390 }}>{children}</div>
    </div>
  );
}

function CompanyPicker({ companies, onPick, onAdd, error }) {
  return (
    <AuthShell>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Выберите компанию</div>
      {error && <div className="alert alert-error">{error}</div>}
      {companies.map((c) => (
        <div
          key={c.companyId}
          onClick={() => onPick(c.companyId)}
          style={{ background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <div style={{ fontSize: 16, fontWeight: 700 }}>{c.companyName}</div>
          <span style={{ fontSize: 22, color: C.border }}>›</span>
        </div>
      ))}
      {onAdd && (
        <div
          onClick={onAdd}
          style={{ border: `1.5px dashed ${C.border}`, borderRadius: 16, padding: 20, marginTop: 6, cursor: 'pointer', textAlign: 'center', color: C.primary, fontSize: 14, fontWeight: 700 }}
        >
          + Добавить студию
        </div>
      )}
    </AuthShell>
  );
}

function NoCompanyAccess() {
  return (
    <AuthShell>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Нет доступа ни к одной компании</div>
      <div style={{ fontSize: 14, color: C.subtle, lineHeight: 1.5 }}>
        Обратитесь к владельцу компании — он может пригласить вас по ссылке в разделе «Команда».
      </div>
    </AuthShell>
  );
}

function CreateCompanyForm({ onCreate, onBack }) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await onCreate(name.trim());
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось создать компанию');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={submit}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Название компании</div>
        <div style={{ fontSize: 13, color: C.subtle, marginBottom: 24 }}>
          Будет отображаться в вашем кабинете. Каждая студия — отдельная подписка; позже можно добавить ещё одну.
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <Field>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Студия на Тверской" />
        </Field>
        <Btn type="submit" disabled={submitting || !name.trim()}>{submitting ? 'Создаём...' : 'Начать работу'}</Btn>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 13, marginTop: 14, padding: 0 }}
          >
            Назад к выбору компании
          </button>
        )}
      </form>
    </AuthShell>
  );
}

export default function Login() {
  const { user, currentCompany, pendingCompanies, needsCompany, isSuperAdmin, selectCompany, createCompany, login } = useAuth();
  const location = useLocation();
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [addingCompany, setAddingCompany] = useState(false);

  // Полностью авторизован (есть и пользователь, и выбранная компания) —
  // дальше решает роутинг, здесь делать нечего.
  if (user && currentCompany) {
    return <Navigate to={location.state?.from || '/'} replace />;
  }

  // Ни одной компании ещё нет. Для Super Admin это ожидаемо при первом
  // входе — он ещё не завёл свой бизнес, поэтому вместо тупика даём форму
  // создания компании (docs/task-company.txt). Обычному пользователю без
  // компании (например, приглашение отозвали) показываем прежнее
  // сообщение — самостоятельно заводить компанию он не должен.
  if (user && needsCompany) {
    return isSuperAdmin ? <CreateCompanyForm onCreate={createCompany} /> : <NoCompanyAccess />;
  }

  // Компаний несколько — нужно спросить, с какой работать, прежде чем
  // пускать дальше (иначе первый же запрос модуля получит 401). С этого же
  // экрана можно завести ещё одну студию (owner может иметь несколько).
  if (user && pendingCompanies) {
    if (addingCompany) {
      return <CreateCompanyForm onCreate={createCompany} onBack={() => setAddingCompany(false)} />;
    }
    return (
      <CompanyPicker
        companies={pendingCompanies}
        error={error}
        onPick={(id) => selectCompany(id).catch((err) => setError(err.response?.data?.error || 'Не удалось выбрать компанию'))}
        onAdd={() => setAddingCompany(true)}
      />
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(emailRef.current.value, passwordRef.current.value);
      // Дальше решает состояние: выбор компании автоматом/вручную/создание —
      // без явной навигации отсюда.
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось войти');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={handleSubmit}>
        {error && <div className="alert alert-error">{error}</div>}
        <Field label="Email">
          <TextInput ref={emailRef} type="email" required />
        </Field>
        <Field label="Пароль">
          <TextInput ref={passwordRef} type="password" required />
        </Field>
        <Btn type="submit" disabled={submitting}>{submitting ? 'Входим...' : 'Войти'}</Btn>
      </form>
    </AuthShell>
  );
}
