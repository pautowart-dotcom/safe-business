import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Badge, C } from '../ui/components.jsx';

const CATEGORIES = [
  { key: 'legal', label: 'Юридические', color: C.primary, bg: C.surface },
  { key: 'tax', label: 'Налоговые', color: C.orange, bg: C.orangeBg },
  { key: 'financial', label: 'Финансовые', color: C.green, bg: C.greenBg },
  { key: 'staff', label: 'Кадровые', color: C.red, bg: C.redBg },
];
const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

function daysLeft(dueDate) {
  const ms = new Date(dueDate) - new Date(new Date().toDateString());
  return Math.round(ms / 86400000);
}

export default function Deadlines() {
  const { isManagement } = useAuth();
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    return api
      .get('/platform/deadlines', { params: category ? { category } : {} })
      .then((res) => setItems(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(load, [category]);

  async function markDone(id) {
    await api.patch(`/platform/deadlines/${id}`, { status: 'done' });
    load();
  }

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Дедлайны</div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto' }}>
        <button
          onClick={() => setCategory('')}
          style={{
            flexShrink: 0, padding: '7px 14px', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'pointer',
            background: category === '' ? C.primary : C.bg, color: category === '' ? '#FFF' : C.secondary, fontSize: 13, fontWeight: 600,
          }}
        >
          Все
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            style={{
              flexShrink: 0, padding: '7px 14px', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'pointer',
              background: category === c.key ? C.primary : C.bg, color: category === c.key ? '#FFF' : C.secondary, fontSize: 13, fontWeight: 600,
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : items.length === 0 ? (
        <div className="empty-hint">Предстоящих сроков нет</div>
      ) : (
        items.map((item) => {
          const cat = CATEGORY_BY_KEY[item.category];
          const left = daysLeft(item.due_date);
          return (
            <Card key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Badge color={cat.color} bg={cat.bg}>{cat.label}</Badge>
                  {left < 0 ? (
                    <span style={{ fontSize: 12, color: C.red, fontWeight: 700 }}>Просрочено на {Math.abs(left)} дн.</span>
                  ) : left === 0 ? (
                    <span style={{ fontSize: 12, color: C.orange, fontWeight: 700 }}>Сегодня</span>
                  ) : (
                    <span style={{ fontSize: 12, color: C.subtle }}>через {left} дн.</span>
                  )}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>
                  {new Date(item.due_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
              {isManagement && (
                <button
                  onClick={() => markDone(item.id)}
                  style={{ flexShrink: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: C.secondary }}
                >
                  Готово
                </button>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
