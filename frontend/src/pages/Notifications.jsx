import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, Btn, C, Group, Row } from '../ui/components.jsx';
import Sheet from '../ui/Sheet.jsx';
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
  network: { label: 'От сети', icon: 'team' },
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
    else setOpenId(item.id);
  }

  if (error) return <Card><div style={{ fontSize: 13.5, color: C.secondary }}>{error}</div></Card>;
  if (!items) return <div className="page-loading">Загрузка...</div>;

  if (items.length === 0) {
    return (
      <Group>
        <Row icon="bell" title="Пока ничего нет" subtitle="Сюда придут напоминания о сроках, изменения в законах, которые касаются вашего бизнеса, и новые пункты теста." />
      </Group>
    );
  }

  // 18.10.2026, вид приложения: «Новые» и «Раньше» строками, непрочитанное —
  // синей точкой; изменение закона (без ссылки) — полным текстом в шторке.
  const fresh = items.filter((i) => !i.readAt);
  const older = items.filter((i) => i.readAt);
  const opened = items.find((i) => i.id === openId);

  const row = (item) => {
    const kind = KIND[item.kind] || KIND.other;
    const unread = !item.readAt;
    return (
      <div
        key={item.id}
        onClick={() => open(item)}
        className="ui-row ui-row-tap"
        style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px' }}
      >
        <div style={{ width: 34, height: 34, borderRadius: 10, background: unread ? C.blueBg : '#F1F3F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name={kind.icon} size={17} color={unread ? C.blue : C.secondary} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.subtle }}>{kind.label}</span>
            <span style={{ fontSize: 11.5, color: C.subtle, flexShrink: 0 }}>{formatWhen(item.createdAt)}</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: unread ? 800 : 600, color: C.primary, lineHeight: 1.35 }}>{item.title}</div>
          {item.body && (
            <div style={{ fontSize: 12.5, color: C.secondary, lineHeight: 1.45, marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-line' }}>
              {item.body}
            </div>
          )}
        </div>
        {unread && <span aria-label="Не прочитано" style={{ width: 9, height: 9, borderRadius: '50%', background: C.blue, flexShrink: 0, marginTop: 6 }} />}
      </div>
    );
  };

  return (
    <div>
      {fresh.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 4px 8px' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.primary }}>Новые</div>
            <button type="button" onClick={markAllRead} style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: C.blue, cursor: 'pointer' }}>
              Прочитать все
            </button>
          </div>
          <Group>{fresh.map(row)}</Group>
        </>
      )}
      {older.length > 0 && <Group title={fresh.length > 0 ? 'Раньше' : 'Всё прочитано'}>{older.map(row)}</Group>}

      <Sheet open={!!opened} onClose={() => setOpenId(null)} title={opened?.title}>
        {opened && (
          <>
            <div style={{ fontSize: 12.5, color: C.subtle, marginBottom: 10 }}>{(KIND[opened.kind] || KIND.other).label} · {formatWhen(opened.createdAt)}</div>
            <div style={{ fontSize: 14, color: C.secondary, lineHeight: 1.55, whiteSpace: 'pre-line', marginBottom: 16 }}>{opened.body}</div>
            <Btn variant="secondary" onClick={() => setOpenId(null)}>Понятно</Btn>
          </>
        )}
      </Sheet>
    </div>
  );
}
