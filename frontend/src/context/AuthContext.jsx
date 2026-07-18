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
  const [loading, setLoading] = useState(true);

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
  }

  function clearSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('currentCompany');
    setUser(null);
    setCurrentCompany(null);
    setPendingCompanies(null);
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
  }

  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    setCurrentCompany(null);

    const { companies } = res.data;
    if (companies.length === 0) {
      throw { response: { data: { error: 'У вас нет доступа ни к одной компании — обратитесь к владельцу за приглашением' } } };
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

  return (
    <AuthContext.Provider
      value={{
        user,
        currentCompany,
        pendingCompanies,
        selectCompany,
        loading,
        login,
        logout,
        isOwner: currentCompany?.role === 'owner',
        isSuperAdmin: !!user?.is_super_admin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
