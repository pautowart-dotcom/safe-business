import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, C } from '../ui/components.jsx';

// Диагностика бага №1 (белый экран) — см. ErrorBoundary.jsx в клиентском
// приложении и backend/src/platform/client-errors.routes.js.
export default function ClientErrors() {
  const [reports, setReports] = useState(null);

  useEffect(() => {
    api.get('/platform/client-errors').then((res) => setReports(res.data));
  }, []);

  if (!reports) return <div className="page-loading">Загрузка...</div>;

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Логи краша</div>
      <div style={{ fontSize: 12, color: C.subtle, marginBottom: 16 }}>Последние 100 отчётов ErrorBoundary клиентского приложения.</div>
      {reports.length === 0 ? (
        <div style={{ fontSize: 13, color: C.subtle }}>Пока ничего не поймано</div>
      ) : (
        reports.map((r) => (
          <Card key={r.id}>
            <div style={{ fontSize: 12, color: C.subtle, marginBottom: 6 }}>
              {new Date(r.created_at).toLocaleString('ru-RU')} · {r.route || '—'} {r.standalone ? '· PWA' : ''}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{r.message || '(без сообщения)'}</div>
            {r.stack && (
              <pre style={{ fontSize: 11, color: C.secondary, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: C.surface, padding: 10, borderRadius: 8, marginBottom: 6 }}>{r.stack}</pre>
            )}
            {r.component_stack && (
              <pre style={{ fontSize: 11, color: C.subtle, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.component_stack}</pre>
            )}
            <div style={{ fontSize: 11, color: C.subtle, marginTop: 6 }}>{r.user_agent}</div>
          </Card>
        ))
      )}
    </div>
  );
}
