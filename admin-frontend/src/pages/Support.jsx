import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, C } from '../ui/components.jsx';

export default function Support() {
  const [requests, setRequests] = useState(null);

  useEffect(() => {
    api.get('/platform/admin/support-requests').then((res) => setRequests(res.data));
  }, []);

  if (!requests) return <div className="page-loading">Загрузка...</div>;

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>Поддержка ({requests.length})</div>
      {requests.length === 0 ? (
        <div style={{ fontSize: 13, color: C.subtle }}>Обращений пока нет</div>
      ) : (
        requests.map((r) => (
          <Card key={r.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{r.user_name || '—'}{r.company_name ? ` · ${r.company_name}` : ''}</div>
              <div style={{ fontSize: 11, color: C.subtle }}>{new Date(r.created_at).toLocaleString('ru-RU')}</div>
            </div>
            <div style={{ fontSize: 14, color: C.secondary, marginBottom: 6 }}>{r.message}</div>
            <a href={`mailto:${r.email}`} style={{ fontSize: 12, color: C.primary }}>{r.email}</a>
          </Card>
        ))
      )}
    </div>
  );
}
