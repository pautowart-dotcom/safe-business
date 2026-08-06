import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client.js';

const AuthContext = createContext(null);

// Проще, чем в клиентском приложении — здесь нет понятия "компания",
// доступ проверяется только по user.is_super_admin (requireSuperAdmin на
// бэкенде, независимо от членства в какой-либо компании).
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('admin_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => {
        setUser(res.data.user);
        localStorage.setItem('admin_user', JSON.stringify(res.data.user));
      })
      .catch(() => {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // 06.08.2026: супер-админ раньше был исключением из проверки устройства
  // (backend/platform/auth.routes.js, loginOrRequireVerification) — по
  // просьбе владельца это убрали ради максимальной защиты главного
  // аккаунта. deviceToken — тот же механизм, что в клиентском ЛК
  // (frontend/src/context/AuthContext.jsx): после успешного кода с почты
  // устройство запоминается, повторный вход с него код уже не спрашивает.
  async function login(email, password) {
    const deviceToken = localStorage.getItem('admin_deviceToken') || undefined;
    const res = await api.post('/auth/login', { email, password, deviceToken });
    if (res.data.requiresDeviceVerification) {
      return res.data; // { requiresDeviceVerification: true, email }
    }
    return applyAuthResult(res.data);
  }

  async function verifyCode(email, code) {
    const res = await api.post('/auth/verify-code', { email, code });
    return applyAuthResult(res.data);
  }

  function applyAuthResult(data) {
    if (!data.user?.is_super_admin) {
      throw { response: { data: { error: 'У этого аккаунта нет доступа к кабинету платформы' } } };
    }
    localStorage.setItem('admin_token', data.token);
    localStorage.setItem('admin_user', JSON.stringify(data.user));
    if (data.deviceToken) localStorage.setItem('admin_deviceToken', data.deviceToken);
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyCode, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
