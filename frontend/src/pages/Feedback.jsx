import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, C } from '../ui/components.jsx';

export default function Feedback() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api.get('/modules/feedback').then((res) => setMessages(res.data)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function markRead(id) {
    await api.patch(`/modules/feedback/${id}`);
    setMessages(messages.map((m) => (m.id === id ? { ...m, read: true } : m)));
  }

  if (loading) return <div className="page-loading">Загрузка...</div>;

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Обратная связь</div>
      {messages.length === 0 ? (
        <div style={{ color: C.subtle, textAlign: 'center', marginTop: 40, fontSize: 14 }}>Нет новых сообщений</div>
      ) : (
        messages.map((m) => (
          <Card key={m.id} style={{ borderLeft: m.read ? 'none' : `3px solid ${C.primary}`, opacity: m.read ? 0.7 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{m.from_name || 'Мастер'}</div>
              <div style={{ fontSize: 11, color: C.subtle }}>{new Date(m.created_at).toLocaleString('ru-RU')}</div>
            </div>
            <div style={{ fontSize: 14, color: C.secondary, lineHeight: 1.5, marginBottom: 10 }}>{m.message}</div>
            {!m.read && (
              <button
                onClick={() => markRead(m.id)}
                style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, color: C.secondary, cursor: 'pointer' }}
              >
                Отметить прочитанным
              </button>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
