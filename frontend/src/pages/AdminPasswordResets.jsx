import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, C } from '../ui/components.jsx';
import { copyToClipboard } from '../utils/clipboard.js';

// Пока в проекте нет отправки email — ссылку на смену пароля видит
// только Super Admin, чтобы вручную передать её человеку, который
// потерял пароль. Убрать вместе с token_plain (migrations/0041), когда
// подключится настоящая отправка почты.
export default function AdminPasswordResets() {
  const { isSuperAdmin } = useAuth();
  const [resets, setResets] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  function load() {
    api.get('/platform/admin/password-resets').then((res) => setResets(res.data));
  }

  useEffect(load, []);

  if (!isSuperAdmin) {
    return <div style={{ padding: 20 }}>Нет доступа.</div>;
  }

  const appUrl = window.location.origin;

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Восстановление пароля — ссылки</div>
      <div style={{ fontSize: 12, color: C.subtle, marginBottom: 16 }}>
        Временно: email ещё не подключён. Скопируй ссылку и передай человеку сам (действует 60 минут).
      </div>
      {resets === null ? (
        <div className="page-loading">Загрузка...</div>
      ) : resets.length === 0 ? (
        <div className="empty-hint">Активных запросов нет</div>
      ) : (
        resets.map((r) => {
          const url = `${appUrl}/reset-password/${r.token_plain}`;
          return (
            <Card key={r.id}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{r.name} · {r.email}</div>
              <div style={{ fontSize: 11, color: C.subtle, marginBottom: 8 }}>
                Запрошено {new Date(r.created_at).toLocaleString('ru-RU')} · действует до {new Date(r.expires_at).toLocaleString('ru-RU')}
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 12, wordBreak: 'break-all', marginBottom: 8 }}>
                {url}
              </div>
              <button
                onClick={async () => {
                  const ok = await copyToClipboard(url);
                  if (ok) {
                    setCopiedId(r.id);
                    setTimeout(() => setCopiedId(null), 1500);
                  }
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
