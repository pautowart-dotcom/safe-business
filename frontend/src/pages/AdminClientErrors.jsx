import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, C } from '../ui/components.jsx';

// Баг №1 (белый экран): временная страница для владельца (Super Admin) —
// смотреть, что реально падает и на каком экране, без подключения телефона
// к компьютеру и консоли разработчика. Снести вместе с ErrorBoundary-
// логированием и client-errors.routes.js, когда причина найдена.
export default function AdminClientErrors() {
  const { isSuperAdmin } = useAuth();
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');

  function load() {
    api
      .get('/platform/client-errors')
      .then((res) => setReports(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Не удалось загрузить'));
  }

  useEffect(load, []);

  if (!isSuperAdmin) {
    return <div style={{ padding: 20 }}>Нет доступа.</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Логи краша (баг №1)</div>
      <div style={{ fontSize: 12, color: C.subtle, marginBottom: 16 }}>
        Последние 100 отчётов ErrorBoundary. Обнови страницу, чтобы подтянуть новые.
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {reports === null ? (
        <div className="page-loading">Загрузка...</div>
      ) : reports.length === 0 ? (
        <div className="empty-hint">Пока ничего не поймано</div>
      ) : (
        reports.map((r) => (
          <Card key={r.id}>
            <div style={{ fontSize: 12, color: C.subtle, marginBottom: 6 }}>
              {new Date(r.created_at).toLocaleString('ru-RU')} · {r.route || '—'} {r.standalone ? '· PWA' : ''}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{r.message || '(без сообщения)'}</div>
            {r.stack && (
              <pre style={{ fontSize: 11, color: C.secondary, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: C.surface, padding: 10, borderRadius: 8, marginBottom: 6 }}>
                {r.stack}
              </pre>
            )}
            {r.component_stack && (
              <pre style={{ fontSize: 11, color: C.subtle, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {r.component_stack}
              </pre>
            )}
            <div style={{ fontSize: 11, color: C.subtle, marginTop: 6 }}>{r.user_agent}</div>
          </Card>
        ))
      )}
    </div>
  );
}
