import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Badge, Btn, C } from '../ui/components.jsx';
import { downloadPdf } from '../utils/downloadPdf.js';

// Пакет 4, Этап 4: карточка допечатки журнала (related_entity_type ===
// 'generated_journal_reprint') получает "Сгенерировать новый" вместо
// обычного "Готово" — это не ручная отметка, а действие, которое реально
// заводит новый бланк (Этап 3 повторно) и скачивает его.
const REPRINT_RELATED_TYPE = 'generated_journal_reprint';

// Пакет 4, Этап 1: 'legal' → 'documents', добавлены 'premises' и 'journals'.
const CATEGORIES = [
  { key: 'staff', label: 'Кадровые', color: C.red, bg: C.redBg },
  { key: 'premises', label: 'Помещение', color: C.blue, bg: C.blueBg },
  { key: 'documents', label: 'Юридические', color: C.primary, bg: C.surface },
  { key: 'tax', label: 'Налоговые', color: C.orange, bg: C.orangeBg },
  { key: 'journals', label: 'Журналы', color: C.purple, bg: C.purpleBg },
  { key: 'financial', label: 'Финансовые', color: C.green, bg: C.greenBg },
];
const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

function daysLeft(dueDate) {
  const ms = new Date(dueDate) - new Date(new Date().toDateString());
  return Math.round(ms / 86400000);
}

export default function Deadlines() {
  const { isManagement, isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reprinting, setReprinting] = useState(null);
  // Налоговые дедлайны скрыты от Администратора (Этап 4) — сам фильтр по
  // ней тоже незачем показывать, он бы вёл в пустой список.
  const visibleCategories = isAdmin ? CATEGORIES.filter((c) => c.key !== 'tax') : CATEGORIES;

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

  async function reprintJournal(item) {
    setReprinting(item.id);
    setError('');
    try {
      const { data } = await api.post(`/platform/generated-journals/${item.related_entity_id}/reprint`);
      await downloadPdf(`/platform/generated-journals/${data.id}/download`, `${data.journalNumber}.pdf`, setError);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось создать новый журнал');
    } finally {
      setReprinting(null);
    }
  }

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Дедлайны</div>

      {/* Баг №9: overflowX:auto без видимой подсказки о прокрутке выглядел как
          "обрезано" — категория "Юридические" и дальше были не видны и не
          воспринимались как доступные для переключения (см. скриншот
          владельца). flexWrap показывает все категории сразу, без скролла. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        <button
          onClick={() => setCategory('')}
          style={{
            padding: '7px 14px', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'pointer',
            background: category === '' ? C.primary : C.bg, color: category === '' ? '#FFF' : C.secondary, fontSize: 13, fontWeight: 600,
          }}
        >
          Все
        </button>
        {visibleCategories.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            style={{
              padding: '7px 14px', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'pointer',
              background: category === c.key ? C.primary : C.bg, color: category === c.key ? '#FFF' : C.secondary, fontSize: 13, fontWeight: 600,
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : items.length === 0 ? (
        <div className="empty-hint">Предстоящих сроков нет</div>
      ) : (
        items.map((item) => {
          const cat = CATEGORY_BY_KEY[item.category];
          const isReprint = item.related_entity_type === REPRINT_RELATED_TYPE;
          // Пакет 4, Этап 1: "Действия" (kind='action') — условие есть,
          // точной даты нет ("не пройден тест", "кончаются расходники") —
          // без due_date, поэтому считать дни/показывать дату для них нельзя.
          const isAction = item.kind === 'action' || !item.due_date;
          const left = isAction ? null : daysLeft(item.due_date);
          return (
            <Card key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Badge color={cat.color} bg={cat.bg}>{cat.label}</Badge>
                  {isAction ? (
                    <span style={{ fontSize: 12, color: C.subtle }}>Требует внимания</span>
                  ) : left < 0 ? (
                    <span style={{ fontSize: 12, color: C.red, fontWeight: 700 }}>Просрочено на {Math.abs(left)} дн.</span>
                  ) : left === 0 ? (
                    <span style={{ fontSize: 12, color: C.orange, fontWeight: 700 }}>Сегодня</span>
                  ) : (
                    <span style={{ fontSize: 12, color: C.subtle }}>через {left} дн.</span>
                  )}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</div>
                {!isAction && (
                  <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>
                    {new Date(item.due_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                )}
              </div>
              {isManagement && isReprint && (
                <Btn small variant="secondary" disabled={reprinting === item.id} onClick={() => reprintJournal(item)}>
                  {reprinting === item.id ? 'Создаём...' : 'Сгенерировать новый'}
                </Btn>
              )}
              {isManagement && !isReprint && (
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
