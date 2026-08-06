import { Component } from 'react';

// Тот же паттерн, что в клиентском ЛК (frontend/src/components/ErrorBoundary.jsx)
// — без границы ошибок необработанное исключение при рендере сносит всё
// дерево React в белый экран (см. владельца, поймавшего это вживую на
// /office/ из-за несовпадения формы ответа /platform/admin/metrics).
// Отчёт летит в тот же общий эндпоинт (platform/client-errors.routes.js,
// без requireAuth) — админка сама же показывает эти записи на "Логи краша".
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Необработанная ошибка интерфейса (админка):', error, info);
    try {
      const baseUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
      const standalone = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
      fetch(`${baseUrl}/platform/client-errors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('admin_token') ? { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } : {}),
        },
        body: JSON.stringify({
          message: error?.message || String(error),
          stack: error?.stack || null,
          componentStack: info?.componentStack || null,
          route: window.location.pathname,
          standalone,
        }),
      }).catch(() => {});
    } catch (err) {
      // диагностика не должна сама уронить ErrorBoundary
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          textAlign: 'center',
          fontFamily: '-apple-system, "Segoe UI", sans-serif',
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 700 }}>Что-то пошло не так</div>
        <div style={{ fontSize: 14, color: '#666', maxWidth: 280 }}>
          Экран не загрузился. Нажмите «Обновить» — обычно этого достаточно.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            border: 'none',
            background: '#2A2A2E',
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Обновить
        </button>
      </div>
    );
  }
}
