import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, C } from '../ui/components.jsx';

// Временно, пока в проекте нет отправки email — см. backend/src/db/migrations/0041.
export default function PasswordResets() {
  const [resets, setResets] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const appUrl = import.meta.env.VITE_CLIENT_APP_URL || 'https://app.business-safe.ru';

  useEffect(() => {
    api.get('/platform/admin/password-resets').then((res) => setResets(res.data));
  }, []);

  if (!resets) return <div className="page-loading">Загрузка...</div>;

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Восстановление пароля</div>
      <div style={{ fontSize: 12, color: C.subtle, marginBottom: 16 }}>
        Временно, пока не подключена отправка email — скопируй ссылку и передай человеку сам (действует 60 минут).
      </div>
      {resets.length === 0 ? (
        <div style={{ fontSize: 13, color: C.subtle }}>Активных запросов нет</div>
      ) : (
        resets.map((r) => {
          const url = `${appUrl}/reset-password/${r.token_plain}`;
          return (
            <Card key={r.id}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{r.name} · {r.email}</div>
              <div style={{ fontSize: 11, color: C.subtle, marginBottom: 8 }}>
                Запрошено {new Date(r.created_at).toLocaleString('ru-RU')} · действует до {new Date(r.expires_at).toLocaleString('ru-RU')}
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, wordBreak: 'break-all', marginBottom: 8 }}>{url}</div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(url).then(() => {
                    setCopiedId(r.id);
                    setTimeout(() => setCopiedId(null), 1500);
                  });
                }}
                style={{ background: C.primary, color: '#FFF', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                {copiedId === r.id ? '✓ Скопировано' : 'Скопировать ссылку'}
              </button>
            </Card>
          );
        })
      )}
    </div>
  );
}
