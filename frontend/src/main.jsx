import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import './styles.css';

// Регистрируем service worker сразу при загрузке (не только когда пользователь
// нажимает "Подписаться") — subscribeToPush() (utils/push.js) ждёт
// navigator.serviceWorker.ready, которому нужна уже стартовавшая регистрация.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Регистрация под /lk/ — scope браузер берёт из пути самого файла,
    // так что push-уведомления и клики по ним останутся привязаны к
    // приложению, а не ко всему домену (там же лендинг).
    navigator.serviceWorker.register('/lk/sw.js').catch((err) => console.error('SW registration failed:', err));
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename="/lk">
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
