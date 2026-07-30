import axios from 'axios';

// timeout — раньше не было вовсе: на медленном/нестабильном соединении
// запрос мог "зависнуть" навсегда, и тогда AuthContext (useEffect с
// api.get('/auth/me')) никогда не доходил до .finally(() => setLoading(false))
// — экран замирал на "Загрузка..." бесконечно, без единой ошибки, и
// обновление страницы просто начинало тот же бесконечный запрос заново.
// 20 секунд — достаточно даже для плохого канала, но гарантирует, что
// приложение хоть когда-нибудь покажет ошибку вместо вечного зависания.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // На каждой странице параллельно летит несколько запросов — если токен
      // протух, все они получают 401 почти одновременно, и раньше каждый
      // независимо дёргал window.location.href, обрывая страницу жёстким
      // переходом посреди того, как React ещё обрабатывает остальные из
      // Promise.all(). Guard ниже не даёт делать это больше одного раза и
      // пропускает редирект, если мы и так уже на /login.
      if (window.location.pathname !== '/login' && !window.__redirectingToLogin) {
        window.__redirectingToLogin = true;
        window.location.href = '/login';
      }
    }
    // Бесплатный период закончился (backend/core/middleware/tenancy.js) —
    // тот же guard от параллельных запросов, что и для 401 выше.
    if (error.response?.status === 402 && error.response?.data?.requiresSubscription) {
      if (window.location.pathname !== '/subscription' && !window.__redirectingToSubscription) {
        window.__redirectingToSubscription = true;
        window.location.href = '/subscription';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
