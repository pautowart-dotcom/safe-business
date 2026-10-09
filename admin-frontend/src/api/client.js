import axios from 'axios';

// timeout — та же причина, что и в клиентском приложении (frontend/src/api/client.js):
// без него зависший запрос на плохом соединении держит экран на "Загрузка..."
// бесконечно, без единой ошибки.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      // Та же ошибка, что была в frontend/src/api/client.js (см. коммит
      // c3e9b1a): абсолютный /login без префикса /office/ не находится
      // нигде на сервере и отдаётся лендингом (catch-all на корне домена,
      // deploy/nginx.conf). Здесь ещё не было guard'а вообще — 401 на
      // самом /auth/login (неверный пароль на форме входа) хардредиректил
      // поверх ещё не отрисовавшегося сообщения об ошибке.
      if (window.location.pathname !== '/office/login') {
        window.location.href = '/office/login';
      }
    } else if (!error.config?.silent) {
      // 09.10.2026: большинство экранов ловили ошибки молча (`.then` без
      // `.catch`, `try/finally` без `catch`) — кнопка просто "ничего не
      // делала", а экран висел на "Загрузка...". Общее всплывающее
      // сообщение показывает Layout.jsx (ApiErrorToast). Запрос с
      // { silent: true } в конфиге — экран сам показывает ошибку.
      const message = error.response?.data?.error
        || (error.code === 'ECONNABORTED' ? 'Сервер не ответил за 20 секунд' : null)
        || (!error.response ? 'Нет связи с сервером' : `Ошибка сервера (${error.response.status})`);
      window.dispatchEvent(new CustomEvent('admin-api-error', { detail: message }));
    }
    return Promise.reject(error);
  }
);

export default api;
