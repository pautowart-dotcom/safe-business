import { useRef, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Btn, Field, TextInput, Select, C, F } from '../ui/components.jsx';
import { NICHE_OPTIONS } from '../ui/nicheOptions.js';

// Группировка NICHE_OPTIONS по сегменту для <optgroup> — только для
// отображения на форме регистрации, сам список остаётся плоским везде,
// где сегмент не нужен (ui/nicheOptions.js).
const NICHE_GROUPS = [
  ['beauty', 'Красота и здоровье'],
  ['cleaning', 'Клининг'],
].map(([segmentKey, segmentLabel]) => [
  segmentLabel,
  NICHE_OPTIONS.filter(([, , seg]) => seg === segmentKey),
]);

export function AuthShell({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', fontFamily: F, background: C.bg }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: C.primary, letterSpacing: '-1px' }}>Безопасный бизнес</div>
        <div style={{ fontSize: 14, color: C.subtle, marginTop: 6 }}>Сроки, документы и проверки под контролем — для малого бизнеса</div>
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

// Раньше единственный публичный способ завести аккаунт — приглашение от
// уже существующего владельца (AcceptInvite.jsx). Тот, кто просто пришёл
// с лендинга, не мог зарегистрироваться сам — этой формы не было.
function RegisterForm({ onRegister, onBack }) {
  const [niche, setNiche] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!acceptedTerms || !niche) return;
    setError('');
    setSubmitting(true);
    try {
      await onRegister({ name, email, password, niche, acceptedTerms, analyticsConsent });
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось зарегистрироваться');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        {/* Ниша — первое поле (20.08.2026, владелец лично столкнулся: раньше
            её вообще не спрашивали) — определяет термины и содержимое всего
            дальнейшего онбординга, поэтому идёт раньше даже имени. */}
        <Field label="Чем занимается ваш бизнес">
          <Select value={niche} onChange={(e) => setNiche(e.target.value)} required>
            <option value="" disabled>Выберите направление</option>
            {NICHE_GROUPS.map(([groupLabel, options]) => (
              <optgroup key={groupLabel} label={groupLabel}>
                {options.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Ваше имя">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Email">
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Пароль">
          <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </Field>
        {/* Название компании убрано (17.08.2026) — заводится автоматически
            ("Моя компания"), переименовать можно сразу после входа в
            Настройках. Раньше поле было обязательным, лишний барьер перед
            тем, как человек увидит хоть какую-то ценность продукта. */}

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, fontSize: 12, color: C.secondary, lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} style={{ marginTop: 2 }} required />
          <span>
            Я принимаю условия{' '}
            <a href="/lk/legal/oferta" target="_blank" rel="noreferrer" style={{ color: C.primary }}>оферты</a>
            {' '}и{' '}
            <a href="/lk/legal/privacy_policy" target="_blank" rel="noreferrer" style={{ color: C.primary }}>политики конфиденциальности</a>
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 20, fontSize: 12, color: C.subtle, lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={analyticsConsent} onChange={(e) => setAnalyticsConsent(e.target.checked)} style={{ marginTop: 2 }} />
          <span>Согласен на использование обезличенных агрегированных данных для аналитики (необязательно, можно отозвать позже в настройках)</span>
        </label>

        <Btn type="submit" disabled={submitting || !acceptedTerms || !niche}>{submitting ? 'Создаём аккаунт...' : 'Зарегистрироваться'}</Btn>
        <button
          type="button"
          onClick={onBack}
          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 13, marginTop: 14, padding: 0 }}
        >
          Уже есть аккаунт — войти
        </button>
      </form>
    </AuthShell>
  );
}

// Один и тот же экран для двух поводов: код сразу после регистрации и код
// при входе с ещё не подтверждённого устройства (см. AuthContext.jsx —
// backend не различает эти случаи).
export function VerifyCodeForm({ email, onVerify, onBack, onResend }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  // Флаг в ref, а не только в state — React обновляет state не мгновенно,
  // и двойной клик/Enter+клик почти одновременно успевали пройти оба до
  // ре-рендера с disabled. Код одноразовый: второй запрос с тем же кодом
  // видел его уже использованным и показывал "неверный", хотя первый уже
  // успешно входил — сбивало с толку.
  const submittingRef = useRef(false);

  async function submit(e) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError('');
    setSubmitting(true);
    try {
      await onVerify(email, code);
    } catch (err) {
      if (err.codeAcceptedButFollowupFailed) {
        setError('Код принят, но не удалось войти — обновите страницу, вход уже должен сработать.');
      } else {
        setError(err.response?.data?.error || 'Не удалось подтвердить код');
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  // Переиспользует тот же login(email, password), которым мы уже вошли на
  // предыдущем шаге (backend/platform/auth.routes.js: устройство всё ещё не
  // подтверждено → loginOrRequireVerification снова шлёт код, и это тот же
  // сам по себе rate-limit, что и у обычного входа). Пароль передаётся
  // отдельным пропом, а не хранится здесь — форма ввода кода его не знает.
  async function resend() {
    if (!onResend) return;
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
    <AuthShell>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Код из письма</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 20, lineHeight: 1.5 }}>
        Отправили код на {email}. Проверьте папку "Спам", если письмо не пришло за пару минут.
      </div>
      <form onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        {resent && !error && <div className="alert alert-success">Код отправлен повторно</div>}
        <Field label="Код">
          <TextInput
            autoFocus
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            required
          />
        </Field>
        <Btn type="submit" disabled={submitting || code.length < 6}>{submitting ? 'Проверяем...' : 'Подтвердить'}</Btn>
        {onResend && (
          <button
            type="button"
            onClick={resend}
            disabled={resending}
            style={{ width: '100%', background: 'none', border: 'none', cursor: resending ? 'default' : 'pointer', color: resending ? C.subtle : C.primary, fontSize: 13, fontWeight: 600, marginTop: 14, padding: 0 }}
          >
            {resending ? 'Отправляем...' : 'Отправить код ещё раз'}
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 13, marginTop: 14, padding: 0 }}
        >
          Назад
        </button>
      </form>
    </AuthShell>
  );
}

export default function Login() {
  const { user, currentCompany, pendingCompanies, needsCompany, isSuperAdmin, selectCompany, createCompany, login, register, verifyCode } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [addingCompany, setAddingCompany] = useState(false);
  // Отмечаем, что компания только что создана (регистрация или "+ Добавить
  // студию"), чтобы один раз направить владельца сразу на выбор сферы/ниши
  // безопасности вместо дашборда — необязательный шаг, экран "Безопасность"
  // и так открывается по любой ссылке в приложении, здесь просто ускоряем
  // первое знакомство. Не блокирует ничего — обычная навигация, можно уйти.
  const [justCreatedCompany, setJustCreatedCompany] = useState(false);
  // Заполняется email'ом, когда регистрация или вход требуют код с почты —
  // рендерим VerifyCodeForm вместо обычной формы, пока не подтвердят.
  const [verifyEmail, setVerifyEmail] = useState(null);
  // Пароль храним только в памяти, рядом с verifyEmail, — исключительно
  // чтобы "Отправить код ещё раз" могло повторно позвать login(email,
  // password) (тот же путь, что обычный вход — backend снова шлёт код,
  // пока устройство не подтверждено). Нигде не сохраняется, сбрасывается
  // вместе с verifyEmail.
  const [verifyPassword, setVerifyPassword] = useState(null);
  // Лендинг ведёт сразу на форму регистрации (?mode=register), обычный
  // заход в приложение — на вход.
  const [mode, setMode] = useState(searchParams.get('mode') === 'register' ? 'register' : 'login');

  // Полностью авторизован (есть и пользователь, и выбранная компания) —
  // проверяем это ПЕРЕД экраном ввода кода. Раньше было наоборот: если код
  // на самом деле уже был принят (например, гоночная ситуация — автоподста-
  // новка кода из письма и ручное нажатие "Подтвердить" почти одновременно,
  // один запрос успевал войти, другой видел код уже использованным и падал),
  // экран ввода кода всё равно оставался поверх и показывал последнюю
  // ошибку — переход в приложение никогда не наступал сам, помогало только
  // обновление страницы. Теперь как только сессия реально готова, уходим
  // дальше сразу, независимо от того, что ещё показывает verifyEmail.
  if (user && currentCompany) {
    return <Navigate to={justCreatedCompany ? '/security' : (location.state?.from || '/')} replace />;
  }

  if (verifyEmail) {
    return (
      <VerifyCodeForm
        email={verifyEmail}
        onVerify={verifyCode}
        onBack={() => { setVerifyEmail(null); setVerifyPassword(null); }}
        onResend={verifyPassword ? () => login(verifyEmail, verifyPassword) : undefined}
      />
    );
  }

  // Ни одной компании ещё нет. Для Super Admin это ожидаемо при первом
  // входе — он ещё не завёл свой бизнес, поэтому вместо тупика даём форму
  // создания компании (docs/task-company.txt). Обычному пользователю без
  // компании (например, приглашение отозвали) показываем прежнее
  // сообщение — самостоятельно заводить компанию он не должен.
  if (user && needsCompany) {
    return isSuperAdmin ? (
      <CreateCompanyForm onCreate={async (name) => { await createCompany(name); setJustCreatedCompany(true); }} />
    ) : (
      <NoCompanyAccess />
    );
  }

  // Компаний несколько — нужно спросить, с какой работать, прежде чем
  // пускать дальше (иначе первый же запрос модуля получит 401). С этого же
  // экрана можно завести ещё одну студию (owner может иметь несколько).
  if (user && pendingCompanies) {
    if (addingCompany) {
      return (
        <CreateCompanyForm
          onCreate={async (name) => { await createCompany(name); setJustCreatedCompany(true); }}
          onBack={() => setAddingCompany(false)}
        />
      );
    }
    // Заводить новую компанию может только владелец (backend/platform/
    // companies.routes.js) — не показываем кнопку тем, кто нигде не owner,
    // чтобы не предлагать действие, которое всё равно отклонится.
    const canAddCompany = pendingCompanies.some((c) => c.role === 'owner');
    return (
      <CompanyPicker
        companies={pendingCompanies}
        error={error}
        onPick={(id) => selectCompany(id).catch((err) => setError(err.response?.data?.error || 'Не удалось выбрать компанию'))}
        onAdd={canAddCompany ? () => setAddingCompany(true) : undefined}
      />
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await login(emailRef.current.value, passwordRef.current.value);
      if (result?.requiresDeviceVerification) {
        setVerifyEmail(result.email);
        setVerifyPassword(passwordRef.current.value);
      }
      // Иначе дальше решает состояние: выбор компании автоматом/вручную/
      // создание — без явной навигации отсюда.
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось войти');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(data) {
    const result = await register(data);
    // /auth/register всегда заводит новую компанию (см. backend) — код с
    // почты идёт следующим шагом, а currentCompany появится только после
    // него (applyAuthResult), поэтому флаг ставим уже тут.
    setJustCreatedCompany(true);
    if (result?.requiresDeviceVerification) {
      setVerifyEmail(result.email);
      setVerifyPassword(data.password);
    }
  }

  if (mode === 'register') {
    return <RegisterForm onRegister={handleRegister} onBack={() => setMode('login')} />;
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
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
          <button
            type="button"
            onClick={() => setMode('register')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.primary, fontSize: 13, fontWeight: 600, padding: 0 }}
          >
            Зарегистрироваться
          </button>
          <Link to="/forgot-password" style={{ color: C.subtle, fontSize: 13, textDecoration: 'none' }}>Забыли пароль?</Link>
        </div>
      </form>
    </AuthShell>
  );
}
