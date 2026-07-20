import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client.js';

const AuthContext = createContext(null);

// Бэкенд использует двухшаговую авторизацию (docs/task.md: "один пользователь
// может иметь доступ к нескольким компаниям"): POST /auth/login выдаёт базовый
// токен (session: 'base') со списком компаний, но НЕ даёт доступа к данным
// компании — все модули требуют requireTenant, которому нужен токен со
// session: 'company'. Его получают отдельным вызовом POST /auth/select-company.
// Раньше фронтенд останавливался на первом шаге, поэтому первый же запрос
// Dashboard/модуля получал 401 "Выберите компанию для продолжения", и общий
// interceptor (api/client.js) принимал это за невалидный токен и разлогинивал.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [currentCompany, setCurrentCompany] = useState(() => {
    const stored = localStorage.getItem('currentCompany');
    return stored ? JSON.parse(stored) : null;
  });
  // Заполняется, когда у пользователя больше одной компании и нужно спросить,
  // с какой работать — Login.jsx рендерит выбор вместо формы входа.
  const [pendingCompanies, setPendingCompanies] = useState(null);
  // true, когда у пользователя вообще нет ни одной компании (например,
  // Super Admin впервые входит в интерфейс и ещё не завёл свой бизнес) —
  // Login.jsx рендерит форму создания компании вместо ошибки.
  const [needsCompany, setNeedsCompany] = useState(false);
  const [loading, setLoading] = useState(true);
  // Пакет 3, Этап 1.1: флаги модулей компании (сейчас — visits/clients,
  // остальные всегда включены). {} до первой загрузки — hasModule() до этого
  // момента считает всё доступным, чтобы не мигать нав-баром на типичном
  // случае (модуль включён), а не наоборот.
  const [modules, setModules] = useState({});

  function loadModules() {
    return api.get('/platform/modules').then((res) => {
      setModules(Object.fromEntries(res.data.map((m) => [m.key, m.enabled])));
    });
  }

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then(async (res) => {
        const { user: u, companies, tenant } = res.data;
        localStorage.setItem('user', JSON.stringify(u));
        setUser(u);

        if (tenant) {
          applyCompany(tenant.companyId, companies, tenant.role, tenant.branchId);
          await loadModules();
        } else if (companies.length === 0) {
          setNeedsCompany(true);
        } else if (companies.length === 1) {
          await selectCompany(companies[0].companyId);
        } else if (companies.length > 1) {
          setPendingCompanies(companies);
        }
      })
      .catch(() => {
        clearSession();
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyCompany(companyId, companies, role, branchId) {
    const match = companies.find((c) => c.companyId === companyId);
    const cc = { id: companyId, name: match?.companyName, role, branchId };
    localStorage.setItem('currentCompany', JSON.stringify(cc));
    setCurrentCompany(cc);
    setPendingCompanies(null);
    setNeedsCompany(false);
  }

  // POST /platform/companies уже существует и именно для этого:
  // "владелец может завести дополнительную компанию под тем же аккаунтом" —
  // тот же эндпоинт покрывает и случай "ни одной компании ещё нет".
  // Требует только requireAuth, так что работает и на базовом токене.
  async function createCompany(name, industrySegment) {
    const res = await api.post('/platform/companies', { name, industrySegment });
    await selectCompany(res.data.companyId);
  }

  function clearSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('currentCompany');
    setUser(null);
    setCurrentCompany(null);
    setPendingCompanies(null);
    setNeedsCompany(false);
    setModules({});
  }

  // Меняет активный токен с базового на company-scoped (или переключает
  // компанию, если пользователь уже был внутри одной). Токен всегда один —
  // company-токен проходит и там, где достаточно requireAuth, так что после
  // выбора компании отдельно посылать базовый токен больше не нужно.
  async function selectCompany(companyId) {
    const res = await api.post('/auth/select-company', { companyId });
    localStorage.setItem('token', res.data.token);
    const cc = { id: res.data.company.id, name: res.data.company.name, role: res.data.role, branchId: res.data.branchId };
    localStorage.setItem('currentCompany', JSON.stringify(cc));
    setCurrentCompany(cc);
    setPendingCompanies(null);
    setModules({});
    await loadModules();
  }

  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    setCurrentCompany(null);

    const { companies } = res.data;
    if (companies.length === 0) {
      setNeedsCompany(true);
      return;
    }
    if (companies.length === 1) {
      await selectCompany(companies[0].companyId);
    } else {
      setPendingCompanies(companies);
    }
  }

  function logout() {
    clearSession();
  }

  // Принять приглашение по токену (страница /invite/:token). Бэкенд отвечает
  // тем же base-токеном, что и login/register, поэтому дальше — тот же шаг
  // selectCompany(companyId), что и при обычном входе с одной компанией.
  async function acceptInvite({ token, name, email, password, acceptedTerms, analyticsConsent }) {
    const res = await api.post('/auth/accept-invite', { token, name, email, password, acceptedTerms, analyticsConsent });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    setCurrentCompany(null);
    await selectCompany(res.data.companyId);
  }

  // Синхронизирует отображаемое имя компании (шапка, "Сменить компанию")
  // после переименования в Настройках — иначе оно оставалось бы старым
  // до следующего логина/select-company (localStorage/currentCompany
  // кэшируются с момента выбора компании).
  function renameCurrentCompany(name) {
    const cc = { ...currentCompany, name };
    localStorage.setItem('currentCompany', JSON.stringify(cc));
    setCurrentCompany(cc);
  }

  // Синхронизирует фото профиля в шапке сразу после загрузки (Настройки),
  // не дожидаясь следующего /auth/me.
  function setUserAvatar(avatarUrl) {
    const u = { ...user, avatar_url: avatarUrl };
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
  }

  // Этап 11: отмечает вступительную инструкцию прочитанной — modal
  // (components/OnboardingModal.jsx) больше не показывается этому
  // пользователю. Обновляет user локально сразу, не дожидаясь /auth/me.
  async function markOnboardingSeen() {
    await api.patch('/auth/me', { onboardingSeen: true });
    const u = { ...user, onboarding_seen_at: new Date().toISOString() };
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
  }

  // Открывает выбор компании заново (кнопка "Сменить компанию" в
  // настройках) — переиспользует тот же экран выбора, что и при логине.
  async function switchCompany() {
    const res = await api.get('/auth/me');
    localStorage.removeItem('currentCompany');
    setCurrentCompany(null);
    setPendingCompanies(res.data.companies);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        currentCompany,
        pendingCompanies,
        needsCompany,
        selectCompany,
        createCompany,
        switchCompany,
        renameCurrentCompany,
        setUserAvatar,
        markOnboardingSeen,
        loading,
        login,
        logout,
        acceptInvite,
        isOwner: currentCompany?.role === 'owner',
        isAdmin: currentCompany?.role === 'admin',
        // Этап 5: администратор управляет компанией наравне с владельцем
        // (кроме итоговой прибыли/маржи — это скрывается на бэкенде, не тут).
        // Используется везде, где раньше проверялось isOwner для доступа к
        // разделам/действиям, не связанным именно с итоговой прибылью.
        isManagement: currentCompany?.role === 'owner' || currentCompany?.role === 'admin',
        isSuperAdmin: !!user?.is_super_admin,
        // false только когда модуль явно выключен (см. комментарий у useState(modules))
        hasModule: (key) => modules[key] !== false,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
