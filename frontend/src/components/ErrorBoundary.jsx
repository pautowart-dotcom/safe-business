import { Component } from 'react';

// Баг №1 (белый экран при навигации, особо критично в PWA): без границы
// ошибок необработанное исключение при рендере сносит всё дерево React,
// а восстановиться раньше можно было только браузерным жестом
// pull-to-refresh — в standalone PWA (иконка на "Домашнем экране") такого
// жеста нет вообще, поэтому экран оставался белым насовсем, кроме
// перезапуска приложения. Кнопка ниже работает одинаково в браузере и в
// PWA, потому что не зависит от системных жестов — обычный reload().
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Необработанная ошибка интерфейса:', error, info);
    // Временная диагностика бага №1 (белый экран) — владелец просит поймать,
    // что именно падает и на каком экране, раз чтением кода причину не
    // найти. Снести вместе с backend/src/platform/client-errors.routes.js и
    // миграцией 0040, когда причина найдена и пофикшена.
    try {
      const baseUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
      const standalone = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
      fetch(`${baseUrl}/platform/client-errors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('token') ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : {}),
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
