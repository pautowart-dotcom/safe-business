import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, C } from '../ui/components.jsx';
import Linkify from '../ui/Linkify.jsx';

export default function Feedback() {
  const { masterLabel } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api.get('/modules/feedback').then((res) => setMessages(res.data)).finally(() => setLoading(false));
  }

  useEffect(load, []);
  usePullToRefresh(load);

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
              <div style={{ fontSize: 13, fontWeight: 700 }}>{m.from_name || masterLabel}</div>
              <div style={{ fontSize: 11, color: C.subtle }}>{new Date(m.created_at).toLocaleString('ru-RU')}</div>
            </div>
            <div style={{ fontSize: 14, color: C.secondary, lineHeight: 1.5, marginBottom: 10 }}><Linkify text={m.message} /></div>
            {m.ai_response ? (
              <div style={{ background: C.surface, borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.subtle, marginBottom: 3 }}>ОТВЕТ ИИ (черновик, не проверено человеком)</div>
                <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.4 }}>{m.ai_response}</div>
              </div>
            ) : m.escalated && !m.read ? (
              <div style={{ fontSize: 11, color: C.primary, fontWeight: 600, marginBottom: 10 }}>Требует вашего ответа — ИИ не смог</div>
            ) : null}
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
