import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, Btn, C } from '../ui/components.jsx';
import Icon from '../ui/Icon.jsx';

// Раздел «Уведомления» (Ж3, 14.10.2026; идея владельца — одно место, куда
// приходят и сроки, и изменения законов). Бэкенд — platform/
// notifications.routes.js, записи пишет core/notifications.js. Push
// остаётся сигналом, здесь — то, к чему можно вернуться.
//
// Изменение закона показываем текстом целиком прямо в карточке: отдельного
// экрана для них в приложении нет. Остальное ведёт по url (сроки — в
// «Дедлайны», новые пункты теста — в «Безопасность»).

const KIND = {
  deadline: { label: 'Срок', icon: 'bell' },
  law: { label: 'Изменение в законах', icon: 'book' },
  test: { label: 'Тест', icon: 'shield' },
  other: { label: 'Сообщение', icon: 'inbox' },
};

function formatWhen(iso) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return `сегодня, ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const { data } = await api.get('/platform/notifications');
      setItems(data.items);
      setUnreadCount(data.unreadCount);
      setError('');
    } catch {
      setError('Не удалось загрузить уведомления. Потяните вниз, чтобы попробовать ещё раз.');
    }
  }

  useEffect(() => {
    load();
  }, []);
  usePullToRefresh(load);

  async function markRead(item) {
    if (item.readAt) return;
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, readAt: new Date().toISOString() } : i)));
    setUnreadCount((n) => Math.max(n - 1, 0));
    window.dispatchEvent(new Event('notifications:changed'));
    await api.post(`/platform/notifications/${item.id}/read`).catch(() => {});
  }

  async function markAllRead() {
    setItems((list) => list.map((i) => (i.readAt ? i : { ...i, readAt: new Date().toISOString() })));
    setUnreadCount(0);
    window.dispatchEvent(new Event('notifications:changed'));
    await api.post('/platform/notifications/read-all').catch(() => {});
  }

  function open(item) {
    markRead(item);
    if (item.url) navigate(item.url);
    else setOpenId(openId === item.id ? null : item.id);
  }

  if (error) return <Card><div style={{ fontSize: 13.5, color: C.secondary }}>{error}</div></Card>;
  if (!items) return <div style={{ fontSize: 13.5, color: C.subtle, padding: '8px 2px' }}>Загружаем…</div>;

  if (items.length === 0) {
    return (
      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.primary, marginBottom: 6 }}>Пока ничего нет</div>
        <div style={{ fontSize: 13.5, color: C.secondary, lineHeight: 1.5 }}>
          Сюда придут напоминания о сроках, изменения в законах, которые касаются вашего бизнеса, и новые пункты теста.
        </div>
      </Card>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, minHeight: 32 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.secondary }}>
          {unreadCount > 0 ? `Непрочитанных: ${unreadCount}` : 'Всё прочитано'}
        </div>
        {unreadCount > 0 && <Btn small variant="secondary" onClick={markAllRead}>Прочитать все</Btn>}
      </div>

      {items.map((item) => {
        const kind = KIND[item.kind] || KIND.other;
        const unread = !item.readAt;
        const expanded = openId === item.id;
        return (
          <Card key={item.id} onClick={() => open(item)} style={{ padding: 14, borderLeft: unread ? `3px solid ${C.accent}` : '3px solid transparent' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={kind.icon} size={16} color={unread ? C.primary : C.subtle} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: C.subtle }}>{kind.label}</span>
                  <span style={{ fontSize: 11.5, color: C.subtle, flexShrink: 0 }}>{formatWhen(item.createdAt)}</span>
                </div>
                <div style={{ fontSize: 14.5, fontWeight: unread ? 700 : 600, color: C.primary, lineHeight: 1.35 }}>{item.title}</div>
                {item.body && (
                  <div
                    style={{
                      fontSize: 13, color: C.secondary, lineHeight: 1.5, marginTop: 4, whiteSpace: 'pre-line',
                      ...(item.url || expanded ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
                    }}
                  >
                    {item.body}
                  </div>
                )}
                {!item.url && item.body && !expanded && item.body.length > 160 && (
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: C.accent, marginTop: 6 }}>Читать полностью</div>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
